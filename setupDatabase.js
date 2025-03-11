const sqlite3 = require('sqlite3').verbose();

// Connect to the SQLite database (or create it if it doesn't exist)
let db = new sqlite3.Database('./tracking.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the tracking database.');
});

// Create the 'zoneSettings' table
db.run(`CREATE TABLE IF NOT EXISTS zoneSettings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_name TEXT UNIQUE NOT NULL,
  setting_value INTEGER NOT NULL
)`, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Created the zoneSettings table.');

    // Insert default values using a prepared statement
    const insert = db.prepare(`INSERT OR IGNORE INTO zoneSettings (setting_name, setting_value) VALUES (?, ?)`);
    
    insert.run('workzoneTime', 30000, (err) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log('Inserted default value for workzoneTime.');
      }
    });

    insert.run('redzoneTime', 30000, (err) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log('Inserted default value for redzoneTime.');
      }
    });

    insert.finalize();
  }
});

// Create the 'beacons_config' table
db.run(`CREATE TABLE IF NOT EXISTS beacons_config (
  floor TEXT NOT NULL,
  offset DOUBLE NOT NULL,
  widthInFeet DOUBLE NOT NULL,
  heightInFeet DOUBLE NOT NULL
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  const floor = 1;
  const offset = 13;
  const widthInFeet = 24;
  const heightInFeet = 34;
  const insertStmt = db.prepare('INSERT OR REPLACE INTO beacons_config (floor, offset, widthInFeet, heightInFeet) VALUES (?, ?, ?, ?)');

  insertStmt.run(floor, offset, widthInFeet, heightInFeet, (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log(`Inserted or updated beacons_config floor: ${floor}, offset: ${offset}, widthInFeet : ${widthInFeet}, heightInFeet: ${heightInFeet}`);
    }
  });

  insertStmt.finalize();
  console.log('Created the beacons_config table.');
});

// Create the 'beacons' table
db.run(`CREATE TABLE IF NOT EXISTS beacons (
  floor TEXT NOT NULL,
  major INTEGER NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  const xycoordinate = [
    { floor: 1, major: '310', x: 8, y: 8 },
    { floor: 1, major: '320', x: 16, y: 8 },
    { floor: 1, major: '306', x: 20, y: 8 },
    { floor: 1, major: '304', x: 8, y: 16 },
    { floor: 1, major: '323', x: 14, y: 16 },
    { floor: 1, major: '309', x: 20, y: 16 },
    { floor: 1, major: '308', x: 8, y: 28 },
    { floor: 1, major: '312', x: 14, y: 28 },
    { floor: 1, major: '322', x: 20, y: 28 },
  ];

  const insertStmt = db.prepare('INSERT OR REPLACE INTO beacons (floor, major, x, y) VALUES (?, ?, ?, ?)');

  xycoordinate.forEach((xy) => {
    insertStmt.run(xy.floor, xy.major, xy.x, xy.y, (err) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log(`Inserted or updated beacons coordinate ${xy.floor}, ${xy.major}, ${xy.x}, ${xy.y}`);
      }
    });
  });

  insertStmt.finalize();
  console.log('Created the beacons table.');
});

// Create the 'boundary' table
db.run(`CREATE TABLE IF NOT EXISTS boundary (
  boundaryID INTEGER PRIMARY KEY AUTOINCREMENT,
  floor TEXT NOT NULL,
  x0 DOUBLE NOT NULL,
  x1 DOUBLE NOT NULL,
  y0 DOUBLE NOT NULL,
  y1 DOUBLE NOT NULL,
  associated_ppu_id TEXT NOT NULL,
  workzone INTEGER,
  redzone INTEGER 
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Created the boundary table.');
});

// Create the 'incidents' table
db.run(`CREATE TABLE IF NOT EXISTS workzoneIncidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ppu_id INTEGER NOT NULL,
  duration INTEGER NOT NULL, -- Duration in seconds
  boundary_id INTEGER NOT NULL,
  FOREIGN KEY (boundary_id) REFERENCES boundaries(id)
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Created the workzoneIncidents table.');
});

// Create the 'incidents' table
db.run(`CREATE TABLE IF NOT EXISTS redzoneIncidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ppu_id INTEGER NOT NULL,
  duration INTEGER NOT NULL, -- Duration in seconds
  boundary_id INTEGER NOT NULL,
  FOREIGN KEY (boundary_id) REFERENCES boundaries(id)
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Created the redzoneIncidents table.');
});

// Create the 'workers' table
db.run(`CREATE TABLE IF NOT EXISTS workers (
  workerID INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  occupation TEXT NOT NULL,
  numIncidents INTEGER NOT NULL,
  boundaryID INTEGER
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Created the workers table.');
});

// Create the 'floor' table
db.run(`CREATE TABLE IF NOT EXISTS floor (
    floor_number INTEGER PRIMARY KEY,
    imgurl TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Created the floor table.');

    // Insert the floor data
    const floors = [
        { floor_number: 1, imgurl: 'img/floor1.png' },
        { floor_number: 2, imgurl: 'img/floor2.jpg' }
      ];
  
      const insertStmt = db.prepare('INSERT OR REPLACE INTO floor (floor_number, imgurl) VALUES (?, ?)');
  
      floors.forEach((floor) => {
        insertStmt.run(floor.floor_number, floor.imgurl, (err) => {
          if (err) {
            console.error(err.message);
          } else {
            console.log(`Inserted or updated floor ${floor.floor_number}`);
          }
        });
      });
  
      insertStmt.finalize();
  });

// Close the database connection
db.close((err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Closed the database connection.');
});