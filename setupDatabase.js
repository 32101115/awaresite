const sqlite3 = require('sqlite3').verbose();

// Connect to the SQLite database (or create it if it doesn't exist)
let db = new sqlite3.Database('./tracking.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the tracking database.');
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
  const widthInFeet = 16;
  const heightInFeet = 22;
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
    { floor: 1, major: '308', x: 0, y: 0 },
    { floor: 1, major: '312', x: 6, y: 0 },
    { floor: 1, major: '322', x: 12, y: 0 },
    { floor: 1, major: '306', x: 0, y: 12 },
    { floor: 1, major: '323', x: 6, y: 12 },
    { floor: 1, major: '309', x: 12, y: 12 },
    { floor: 1, major: '310', x: 0, y: 20 },
    { floor: 1, major: '304', x: 12, y: 20 },
    { floor: 1, major: '320', x: 8, y: 20 },
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

// Create the 'area' table
db.run(`CREATE TABLE IF NOT EXISTS area (
  areaID INTEGER PRIMARY KEY AUTOINCREMENT,
  floor TEXT NOT NULL,
  yheight DOUBLE NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  xwidth DOUBLE NOT NULL,
  associated_workers_id TEXT NOT NULL
)`, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Created the area table.');
});

// Create the 'workers' table
db.run(`CREATE TABLE IF NOT EXISTS workers (
  workerID INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  occupation TEXT NOT NULL,
  numIncidents INTEGER NOT NULL,
  areaID INTEGER
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