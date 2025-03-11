const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const awsIot = require('aws-iot-device-sdk');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './public/img';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // Ensure parent directories are created
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Get next floor number
app.get('/get-next-floor-number', (req, res) => {
  db.get('SELECT MAX(floor_number) AS maxFloor FROM floor', (err, row) => {
    console.log(`row max floor ${row.maxFloor}`);
    if (err) {
      return res.status(500).send(err.message);
    }
    const nextFloorNumber = (row.maxFloor || 0) + 1;
    res.json({ nextFloorNumber });
  });
});

app.post('/save-floor-data', upload.single('image'), (req, res) => {
  const { floor, offset, widthInFeet, heightInFeet } = req.body;
  const beacons = JSON.parse(req.body.beacons);
  const imgurl = req.file ? `/img/${req.file.filename}` : '';

  // Insert into floor table
  db.run('INSERT OR REPLACE INTO floor (floor_number, imgurl) VALUES (?, ?)', [floor.replace('floor', ''), imgurl], (err) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    // Insert into beacons_config table
    db.run('INSERT OR REPLACE INTO beacons_config (floor, offset, widthInFeet, heightInFeet) VALUES (?, ?, ?, ?)', [floor, offset, widthInFeet, heightInFeet], (err) => {
      if (err) {
        return res.status(500).send(err.message);
      }

      // Insert into beacons table
      const stmt = db.prepare('INSERT OR REPLACE INTO beacons (floor, major, x, y) VALUES (?, ?, ?, ?)');
      beacons.forEach(({ major, x, y }) => {
        stmt.run(floor, major, x, y);
      });
      stmt.finalize();

      res.send('Data saved successfully');
    });
  });
});

// Endpoint to get settings
app.get('/settings', (req, res) => {
  const sql = `SELECT * FROM zoneSettings`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.put('/settings', (req, res) => {
    const settings = req.body; // Expecting an array of settings

    const sql = `UPDATE zoneSettings SET setting_value = ? WHERE setting_name = ?`;

    const promises = settings.map(setting => {
        return new Promise((resolve, reject) => {
            db.run(sql, [setting.value, setting.name], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });

    Promise.all(promises)
        .then(() => res.json({ success: true }))
        .catch(err => res.status(500).json({ error: err.message }));
});

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

app.get('/workzoneIncidents', (req, res) => {
    db.all('SELECT * FROM workzoneIncidents ORDER BY timestamp DESC', (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Failed to fetch workzoneIncidents' });
        } else {
            res.json(rows);
        }
    });
});

app.get('/redzoneIncidents', (req, res) => {
    db.all('SELECT * FROM redzoneIncidents ORDER BY timestamp DESC', (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Failed to fetch redzoneIncidents' });
        } else {
            res.json(rows);
        }
    });
});

app.delete('/deleteIncident/:id', (req, res) => {
    const incidentId = req.params.id;
    const sql = `DELETE FROM workzoneIncidents WHERE id = ?`; // Or redzoneIncidents, depending on context
    db.run(sql, [incidentId], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true });
    });
});

app.get('/boundary/:ppuId', (req, res) => {
    const ppuId = req.params.ppuId;
    const sql = `SELECT boundaryID FROM boundary WHERE associated_ppu_id LIKE ?`;
    db.get(sql, [`%${ppuId}%`], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Database error' });
        } else {
            res.json({ boundaryId: row ? row.boundaryID : null });
        }
    });
});

// Endpoint to get all red zones
app.get('/api/redzones', (req, res) => {
    const sql = `SELECT boundaryID, floor, x0, x1, y0, y1, associated_ppu_id 
                 FROM boundary 
                 WHERE redzone = 1`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching red zones:', err.message);
            res.status(500).json({ error: 'Failed to fetch red zones' });
            return;
        }
        res.json(rows.map(row => ({
            id: row.boundaryID,
            floor: row.floor,
            x0: row.x0,
            x1: row.x1,
            y0: row.y0,
            y1: row.y1,
            associated_ppu_ids: row.associated_ppu_id.split(',') // Assuming this is a comma-separated string
        })));
    });
});

app.get('/api/workzones', (req, res) => {
    const sql = `SELECT boundaryID, floor, x0, x1, y0, y1, associated_ppu_id 
                 FROM boundary 
                 WHERE workzone = 1`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching work zones:', err.message);
            res.status(500).json({ error: 'Failed to fetch work zones' });
            return;
        }
        res.json(rows.map(row => ({
            id: row.boundaryID,
            floor: row.floor,
            x0: row.x0,
            x1: row.x1,
            y0: row.y0,
            y1: row.y1,
            associated_ppu_ids: row.associated_ppu_id.split(',') // Assuming this is a comma-separated string
        })));
    });
});

// Function to publish beacon info to AWS IoT topic
// const publishBeaconInfo = (floorNumber) => {
//     getBeaconInfoByFloor(floorNumber, (err, rows) => {
//         if (err) {
//             console.error('Error fetching beacon info:', err.message);
//         } else {
//             const message = {
//                 floor: floorNumber,
//                 beacons: rows.map(beacon => ({
//                     major: beacon.major,
//                     x: beacon.x,
//                     y: beacon.y
//                 }))
//             };
//             // Publish the message object as a single JSON string
//             device.publish('beacon-info-topic', JSON.stringify(message), (err) => {
//                 if (err) {
//                     console.error('Error publishing message:', err);
//                 } else {
//                     console.log('Beacon info published:', message);
//                 }
//             });
//         }
//     });
// };

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

app.post('/workzone-log-incident', (req, res) => {
  const { ppuId, duration, boundaryId } = req.body;

  if (!ppuId || !duration || !boundaryId) {
    return res.status(400).json({ error: 'Missing required fields: ppuId, duration, boundaryId' });
  }

  const sql = `INSERT INTO workzoneIncidents (ppu_id, duration, boundary_id) VALUES (?, ?, ?)`;
  db.run(sql, [ppuId, duration, boundaryId], function(err) {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Failed to log workzoneIncidents' });
    }
    res.json({ success: true, id: this.lastID });
  });
});

app.post('/redzone-log-incident', (req, res) => {
  const { ppuId, duration, boundaryId } = req.body;

  if (!ppuId || !duration || !boundaryId) {
    return res.status(400).json({ error: 'Missing required fields: ppuId, duration, boundaryId' });
  }

  const sql = `INSERT INTO redzoneIncidents (ppu_id, duration, boundary_id) VALUES (?, ?, ?)`;
  db.run(sql, [ppuId, duration, boundaryId], function(err) {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Failed to log redzoneIncidents' });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Register a beacon
app.post('/register-beacon', (req, res) => {
    const { floor, major, x, y } = req.body;
    const sql = `INSERT INTO beacons (floor, major, x, y) VALUES (?, ?, ?, ?)`;
    db.run(sql, [floor, major, x, y], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error saving beacon');
        } else {
            // publishBeaconInfo(floor);
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

app.post('/add-boundary', (req, res) => {
    const { floor, x0, x1, y0, y1, associated_ppu_id, workzone, redzone} = req.body;
    const sql = `INSERT INTO boundary (floor, x0, x1, y0, y1, associated_ppu_id, workzone, redzone) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`
    db.run(sql, [floor, x0, x1, y0, y1, associated_ppu_id, workzone, redzone], function(err) {
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
    const sql = `DELETE FROM boundary WHERE boundaryID = ?;`
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
    const sql = `SELECT * FROM boundary`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching boundaries');
        } else {
            res.json(rows);
        }
    });
});

app.post('/add-ppu-to-workzone-boundary', (req, res) => {
    const { ppu_ids, boundary_id, workzone } = req.body;

    db.get('SELECT associated_ppu_id FROM boundary WHERE boundaryID = ?', [boundary_id], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: err.message });
            return;
        }

        let updatedPpuIds;
        if (row && row.associated_ppu_id) {
            updatedPpuIds = row.associated_ppu_id + ',' + ppu_ids;
        } else {
            updatedPpuIds = ppu_ids;
        }

        db.run(
            'UPDATE boundary SET associated_ppu_id = ?, workzone = ? WHERE boundaryID = ?',
            [updatedPpuIds, workzone, boundary_id],
            function (err) {
                if (err) {
                    console.error(err.message);
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ message: 'PPU IDs updated successfully', boundaryID: boundary_id });
            }
        );
    });
});

app.post('/add-ppu-to-redzone-boundary', (req, res) => {
    const { ppu_ids, boundary_id, redzone } = req.body;

    db.get('SELECT associated_ppu_id FROM boundary WHERE boundaryID = ?', [boundary_id], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: err.message });
            return;
        }

        let updatedPpuIds;
        if (row && row.associated_ppu_id) {
            updatedPpuIds = row.associated_ppu_id + ',' + ppu_ids;
        } else {
            updatedPpuIds = ppu_ids;
        }

        db.run(
            'UPDATE boundary SET associated_ppu_id = ?, redzone = ? WHERE boundaryID = ?',
            [updatedPpuIds, redzone, boundary_id],
            function (err) {
                if (err) {
                    console.error(err.message);
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ message: 'PPU IDs updated successfully', boundaryID: boundary_id });
            }
        );
    });
});

app.post('/remove-ppu-id', (req, res) => {
    const { boundaryId, ppuId } = req.body;
    db.get('SELECT associated_ppu_id FROM boundary WHERE boundaryID = ?', [boundaryId], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        if (row && row.associated_ppu_id) {
            let ppuIds = row.associated_ppu_id.split(',');
            ppuIds = ppuIds.filter(id => id !== ppuId); // Remove the selected PPU ID
            // Update the boundary record with the new list of associated PPUs
            db.run('UPDATE boundary SET associated_ppu_id = ? WHERE boundaryID = ?', [ppuIds.join(','), boundaryId], function(err) {
                if (err) {
                    console.error(err.message);
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ message: 'PPU ID removed successfully', boundaryID: boundaryId });
            });
        } else {
res.status(404).json({ error: 'Boundary not found or no associated PPU IDs' });
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
// const device = awsIot.device({
//     keyPath: "certificates/5dfb56c854f949a4b3a803ff3bfc955efd4f444657753d3a8e9c3529dd5100e9-private.pem.key",
//     certPath: "certificates/5dfb56c854f949a4b3a803ff3bfc955efd4f444657753d3a8e9c3529dd5100e9-certificate.pem.crt",
//     caPath: "certificates/AmazonRootCA1.pem",
//     clientId: 'aws-iot-thing',
//     host: 'ajbutgedqxt7y-ats.iot.us-east-1.amazonaws.com'
// });

// // Connect and subscribe to a topic
// device.on('connect', function() {
//     console.log('Connected to AWS IoT');
//     device.subscribe('ppu-location-topic');
// });

// // Handle incoming messages
// device.on('message', function(topic, payload) {
//     console.log('Message received:', topic, payload.toString());
//     const data = JSON.parse(payload.toString());

//     // Emit data to all connected clients
//     io.emit('ppuLocationUpdate', data);
// });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});