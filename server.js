const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const awsIot = require('aws-iot-device-sdk');

app.use(express.static('public'));
app.use(express.json());

app.post('/ppu-location', (req, res) => {
    const data = req.body;
    io.emit('ppuLocationUpdate', data);
    res.status(200).send('PPU location data received');
});

// HTTP GET endpoint to retrieve beacon information by floor
app.get('/floor/:floor_number/get_beacon_info', (req, res) => {
    const { floor_number } = req.params;
    const sql = `SELECT major, x, y FROM beacons WHERE floor = ?`;
    db.all(sql, [floor_number], (err, rows) => {
        if (err) {
            console.error('Database error:', err.message);
            res.status(500).send('Error fetching beacons');
        } else {
            const response = {
                floor: floor_number,
                beacons: rows
            };
            console.log('Beacons fetched:', response);
            res.json(response);
        }
    });
});


// Function to publish beacon info to AWS IoT topic
const publishBeaconInfo = (floorNumber) => {
    getBeaconInfoByFloor(floorNumber, (err, rows) => {
        if (err) {
            console.error('Error fetching beacon info:', err.message);
        } else {
            const message = {
                floor: floorNumber,
                beacons: rows.map(beacon => ({
                    major: beacon.major,
                    x: beacon.x,
                    y: beacon.y
                }))
            };
            // Publish the message object as a single JSON string
            device.publish('beacon-info-topic', JSON.stringify(message), (err) => {
                if (err) {
                    console.error('Error publishing message:', err);
                } else {
                    console.log('Beacon info published:', message);
                }
            });
        }
    });
};

const getBeaconInfoByFloor = (floorNumber, callback) => {
    const sql = `SELECT major, x, y FROM beacons WHERE floor = ?`;
    db.all(sql, [floorNumber], (err, rows) => {
        if (err) {
            console.error('Database error:', err.message);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

// Register a beacon
app.post('/register-beacon', (req, res) => {
    const { floor, major, x, y } = req.body;
    const sql = `INSERT INTO beacons (floor, major, x, y) VALUES (?, ?, ?, ?)`;
    db.run(sql, [floor, major, x, y], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error saving beacon');
        } else {
            publishBeaconInfo(floor);
            res.json({ id: this.lastID });
        }
    });
});

app.get('/get-beacons', (req, res) => {
    const { floor } = req.query;
    const sql = `SELECT major, x, y FROM beacons WHERE floor = ?`;
    db.all(sql, [floor], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching beacons');
        } else {
            res.json(rows);
        }
    });
});

app.get('/get-beacons-config', (req, res) => {
    const { floor } = req.query;
    const sql = `SELECT offset, widthInFeet, heightInFeet FROM beacons_config WHERE floor = ?`;
    db.all(sql, [floor], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching beacons');
        } else {
            res.json(rows);
        }
    });
});

app.post('/update-beacons-config', (req, res) => {
    const { floor, offset, widthInFeet, heightInFeet } = req.body;
    const sql = `UPDATE beacons_config SET offset = ?, widthInFeet = ?, heightInFeet = ? WHERE floor = ?`;
    db.run(sql, [offset, widthInFeet, heightInFeet, floor], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error updating beacon configuration');
        } else {
            res.json({ message: 'Configuration updated successfully' });
        }
    });
});

app.post('/remove-beacon', (req, res) => {
    const { majorid } = req.body;
    if (majorid === undefined ) {
      return res.status(400).json({ error: 'majorid is required' });
    }
    const sql = 'DELETE FROM beacons WHERE major = ?';
    db.run(sql, [majorid], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: `Beacon with majorid ${majorid} removed`, changes: this.changes });
    });
});

app.post('/save-boundary', (req, res) => {
    const { floor, left, top, width, height } = req.body;
    const sql = `INSERT INTO area (floor, yheight, x, y, xwidth, associated_workers_id) VALUES (?, ?, ?, ?, ?, '');`
    db.run(sql, [floor, height, left, top, width], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error saving boundary');
        } else {
            res.json({ id: this.lastID });
                }
            });
});

app.post('/remove-boundary', (req, res) => {
    const { id } = req.body;
    const sql = `DELETE FROM area WHERE areaID = ?;`
    db.run(sql, [id], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error removing boundary');
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/boundaries', (req, res) => {
    const sql = `SELECT * FROM area`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching boundaries');
        } else {
            res.json(rows);
        }
    });
});

app.get('/beacons', (req, res) => {
    const sql = `SELECT * FROM beacons`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching boundaries');
        } else {
            res.json(rows);
        }
    });
});

app.get('/beacons_config', (req, res) => {
    const sql = `SELECT * FROM beacons_config`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching boundaries');
        } else {
            res.json(rows);
        }
    });
});

// Connect to the SQLite database
let db = new sqlite3.Database('./tracking.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the tracking database.');
});

io.on('connection', (socket) => {
  console.log('A user connected')

  app.get('/floors', (req, res) => {
    db.all('SELECT floor_number, imgurl FROM floor', [], (err, rows) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Error fetching floor data');
      } else {
        res.json(rows);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Configure your device
const device = awsIot.device({
    keyPath: "certificates/5dfb56c854f949a4b3a803ff3bfc955efd4f444657753d3a8e9c3529dd5100e9-private.pem.key",
    certPath: "certificates/5dfb56c854f949a4b3a803ff3bfc955efd4f444657753d3a8e9c3529dd5100e9-certificate.pem.crt",
    caPath: "certificates/AmazonRootCA1.pem",
    clientId: 'aws-iot-thing',
    host: 'ajbutgedqxt7y-ats.iot.us-east-1.amazonaws.com'
});

// Connect and subscribe to a topic
device.on('connect', function() {
    console.log('Connected to AWS IoT');
    device.subscribe('ppu-location-topic');
});

// Handle incoming messages
device.on('message', function(topic, payload) {
    console.log('Message received:', topic, payload.toString());
    const data = JSON.parse(payload.toString());

    // Emit data to all connected clients
    io.emit('ppuLocationUpdate', data);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});