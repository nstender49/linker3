const players = {};
const ships = {};
var shipCnt = 0;
var colors = [0xfa3c3c, 0xff9029, 0xf0e441, 0x3beb6a, 0x40ddf5, 0xdd57ff];
const shipSize = {width: 70, length: 85, port: 10};
const PORT = {
	CLOSED: "CLOSED",
	OPEN: "OPEN",
	ACTIVE: "ACTIVE",
	LOCKING: "LOCKING",
	LOCKED: "LOCKED",	
};

const config = {
  type: Phaser.HEADLESS,
  parent: 'phaser-example',
  width: 1000,
  height: 1000,
  // width: window.innerWidth,
  // height: window.innerHeight,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  autoFocus: false
};


function preload() {
  this.load.image('ship', './assets/spaceShips_001.png');
}6

function create() {
  const self = this;
  this.physics.world.setBounds(0, 0, 2000, 2000);
  this.players = this.physics.add.group();
  this.players.enableBody = true;
  this.players.physicsBodyType = Phaser.Physics.ARCADE;
  this.physics.add.collider(this.players, this.players);

  io.on('connection', function (socket) {
    console.log('a user connected');
    // create a new player and add it to our players object
    players[socket.id] = {
      rotation: 0,
      x: Math.floor(Math.random() * 700) + 50,
      y: Math.floor(Math.random() * 500) + 50,
      playerId: socket.id,
      color: colors[shipCnt % 6],
      // Input
      input: {
        left: false,
        right: false,
        up: false,
      },
      // Ports
      selectedPort: 2,
      portNeighbor: false,
      // ids of players locked to ports.
      ports: {
        0: false,
        1: false,
        2: false,
        3: false,
      },
      isCaptain: true,
    };
    // add player to server
    addPlayer(self, players[socket.id]);
    // send the players object to the new player
    socket.emit('currentPlayers', players);
    // update all other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('disconnect', function () {
      console.log('user disconnected');
      // remove player from server
      removePlayer(self, socket.id);
      // remove this player from our players object
      delete players[socket.id];
      // emit a message to all players to remove this player
      io.emit('disconnect', socket.id);
    });

    // when a player moves, update the player data
    socket.on('playerInput', function (inputData) {
      handlePlayerInput(self, socket.id, inputData);
    });
  });
}

function update() {
  this.players.getChildren().forEach((player) => {
    // Update captain movement and location.
    const playerInfo = players[player.playerId];
    const input = playerInfo.input;
    // Player hasn't sent any input, nothing to do.
    if (!input) return;

    // Only the captain moves the ship!
    if (playerInfo.isCaptain) {
      if (input.left || input.alt_left) {
        player.setAngularVelocity(-300);
      } else if (input.right || input.alt_right) {
        player.setAngularVelocity(300);
      } else {
        player.setAngularVelocity(0);
      }
    
      if (input.up || input.alt_up) {
        this.physics.velocityFromRotation(player.rotation + 1.5, 200, player.body.acceleration);
      } else if (input.down || input.alt_down) {
        this.physics.velocityFromRotation(player.rotation + 1.5, -200, player.body.acceleration);
      } else {
        player.setAcceleration(0);
      }
      playerInfo.x = player.x;
      playerInfo.y = player.y;
      playerInfo.rotation = player.rotation;

      movePassengers(playerInfo);
    }
  });

  this.players.getChildren().forEach((player) => {
    const playerInfo = players[player.playerId];
    const input = playerInfo.input;

    if (input.lock_port && playerInfo.portNeighbor) playerInfo.locking = !playerInfo.locking;

    // All ports locked.
    if (isNaN(playerInfo.selectedPort)) return;
    if (!input.rot_port) return;

    // Find next open port.
    rotatePort(playerInfo);
  });

  updatePorts();

  // this.physics.world.wrap(this.players, 5);
  io.emit('playerUpdates', players);
}

function rad(deg) {
  return deg * Math.PI / 180;
}

function deg(rad) {
  return rad * 180 / Math.PI;
}

CONNECT_RADIUS = 50;

function dist(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
function isNear(p1, p2, d) {
  return Math.abs(p1.x - p2.x) <= d && Math.abs(p1.y - p2.y) <= d && dist(p1, p2) <= d;
}

function portLocation(ship, portNum) {
  switch(portNum) {
    case 0:
      return {x: ship.x - shipSize.length / 2  * Math.sin(ship.rotation), y: ship.y + shipSize.length / 2 * Math.cos(ship.rotation)};
    case 1:
      return {x: ship.x - shipSize.width / 4  * Math.cos(ship.rotation), y: ship.y - shipSize.width / 4 * Math.sin(ship.rotation)};
    case 2:
      return {x: ship.x + shipSize.length / 2  * Math.sin(ship.rotation), y: ship.y - shipSize.length / 2 * Math.cos(ship.rotation)};
    case 3:
      return {x: ship.x + shipSize.width / 4  * Math.cos(ship.rotation), y: ship.y + shipSize.width / 4 * Math.sin(ship.rotation)};
  }
}

function canConnect(p1, p2) {
  if (p1.selectedPort === 0 && p2.selectedPort !== 2) return false;
  if ((p1.selectedPort === 1 || p1.selectedPort === 3) && !(p2.selectedPort === 1 || p2.selectedPort === 3)) return false;
  if (p1.selectedPort === 2 && !(p2.selectedPort === 0 || p2.selectedPort === 2)) return false;
  return isNear(portLocation(p1, p1.selectedPort), portLocation(p2, p2.selectedPort), 100);
}

function updatePorts() {
  // Check that neighborts are still neighbors
  Object.keys(players).forEach(function (id) {
    const p1 = players[id];
    if (!p1.portNeighbor) return;  // no neighbor
    if (id > p1.portNeighbor) return; // neighbor already checked
    if (canConnect(p1, players[p1.portNeighbor])) return; // still connected
    clearNeighbors(p1);
  });

  // Look for new neighbors
  Object.keys(players).forEach(function (id1) {
    if (players[id1].portNeighbor) return;  // has a neighbor
    Object.keys(players).forEach(function (id2) {
      if (id1 >= id2) return  // p2 already checked
      if (players[id2].portNeighbor) return;  // has a neighbor
      const p1 = players[id1];
      const p2 = players[id2];
      if (!canConnect(p1, p2)) return;
      p1.portNeighbor = id2;
      p2.portNeighbor = id1;
    }, id1);
  });

  // Update port statuses
  Object.keys(players).forEach(function (id1) {
    if (!players[id1].portNeighbor) return;  // no neighbor
    if (id1 >= players[id1].portNeighbor) return  // p2 already checked
    var p1 = players[id1];
    var p2 = players[p1.portNeighbor];
    if (!p2) { clearNeighbors(p1); return; }
    if (p1.locking && p2.locking) lockShips(p1, p2);
  });
}

function rotatePort(playerInfo) {
  for (var i = 0; i <= 4; i++) {
    var p = (playerInfo.selectedPort + i + 1) % 4;
    if (playerInfo.ports[p]) continue;
    if (playerInfo.ports[p] === undefined) continue;
    if (playerInfo.selectedPort !== p) {
      if (playerInfo.portNeighbor) clearNeighbors(playerInfo);
      playerInfo.selectedPort = p;
    }
    return;
  }
}

function movePassengers(playerInfo) {
  Object.keys(playerInfo.ports).forEach(function (port1) {
    // TODO: wtf?
    port1 = parseInt(port1);
    var neighbor = players[playerInfo.ports[port1]];
    if (!neighbor) return;
    var port2 = 0;
    for (; port2 < 4; port2++) {
      if (neighbor.ports[port2] === playerInfo.playerId) break;
    }
    follow(playerInfo, neighbor, port1, port2);
    // TODO: bfs to move rest of ship
  }, playerInfo);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function follow(p1, p2, port1, port2) {
  switch (port2) {
    case 0:
      var diff = (deg(p1.rotation) - deg(p2.rotation) + 360) % 360;
      diff = diff > 180 ? diff - 360 : diff;
      p2.rotation = rad(mod(deg(p2.rotation) + Math.min(Math.abs(diff), 2) * Math.sign(diff), 360));
      break;
    case 1:
    case 3:
      if (port1 === port2) {
        p2.rotation = p1.rotation + rad(180);
      } else {
        p2.rotation = p1.rotation + rad(45) * (port1 === 1 ? -1 : 1);
      }
      break;
    case 2:
      p2.rotation = p1.rotation + rad(180);
      break;
  }
  const p1Port = portLocation(p1, port1);
  const p2Port = portLocation(p2, port2);
  p2.x = p1.x + (p1Port.x - p1.x) + (p2.x - p2Port.x);
  p2.y = p1.y + (p1Port.y - p1.y) + (p2.y - p2Port.y);
}

function lockShips(p1, p2) {
  p1.ports[p1.selectedPort] = p2.playerId;
  p2.ports[p2.selectedPort] = p1.playerId;

  // TODO: locking sequence
  
  // TODO: determine captain of a ship.
  p1.isCaptain = false;
  p2.isCaptain = false;
  var captain = p1.selectedPort === 0 ? p2 : p1;
  captain.isCaptain = true;
  movePassengers(captain);

  rotatePort(p1);
  rotatePort(p2);
}

function clearNeighbors(playerInfo) {
  if (!playerInfo || !playerInfo.portNeighbor) return;
  var p2 = players[playerInfo.portNeighbor];
  if (p2) p2.portNeighbor = p2.locking = false;
  playerInfo.portNeighbor = playerInfo.locking = false;
}

function handlePlayerInput(self, playerId, input) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      players[player.playerId].input = input;
    }
  });
}

function addPlayer(self, playerInfo) {
  const player = self.physics.add.image(playerInfo.x, playerInfo.y, 'ship').setOrigin(0.5, 0.5).setDisplaySize(53, 40);
  player.setDrag(100);
  player.setAngularDrag(100);
  player.setMaxVelocity(200);
  player.playerId = playerInfo.playerId;
  self.players.add(player);
  player.body.collideWorldBounds = true;
  player.body.bounce.setTo(0.9, 0.9);
}


function removePlayer(self, playerId) {
  // TODO: break ship!
  clearNeighbors(players[playerId]);
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      player.destroy();
    }
  });
}

const game = new Phaser.Game(config);
window.gameLoaded();
