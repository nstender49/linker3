var config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: window.innerWidth,
  height: window.innerHeight,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

var game = new Phaser.Game(config);
const shipSize = {width: 70, length: 85, port: 10};
const PORT = {
	CLOSED: "CLOSED",
	OPEN: "OPEN",
	ACTIVE: "ACTIVE",
	LOCKING: "LOCKING",
	LOCKED: "LOCKED",	
};

function handleResize() {
  const height = window.innerHeight;
  const width = window.innerWidth;

  game.width = width;
  game.height = height;
  if (game.renderType === 1) {
    game.renderer.resize(width, height);
    Phaser.Canvas.setSmoothingEnabled(game.context, false);
  }
}
window.addEventListener("resize", handleResize, false);

function preload() {
  this.load.image('ship', './assets/ship_v1.png');
  this.load.image('port', './assets/port.png');
  this.load.image('background', './assets/spaceBackground.jpg');
}

function create() {
  var self = this;
  this.socket = io();
  this.players = this.add.group();

  var bg = this.add.image(0, 0, 'background').setOrigin(0, 0);

  this.socket.on('currentPlayers', function (players) {
    Object.keys(players).forEach(function (id) {
      displayPlayers(self, players[id], 'ship');
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    displayPlayers(self, playerInfo, 'ship');
  });

  this.socket.on('disconnect', function (playerId) {
    self.players.getChildren().forEach(function (player) {
      if (playerId === player.playerId) {
        player.destroy();
      }
    });
  });

  this.socket.on('playerUpdates', function (players) {
    Object.keys(players).forEach(function (id) {
      const playerInfo = players[id];
      self.players.getChildren().forEach(function (player) {
        if (playerInfo.playerId === player.playerId) {
          player.setRotation(playerInfo.rotation);
          player.setPosition(playerInfo.x, playerInfo.y);
          setPortColors(player, playerInfo);
          player.loc.setText(`${id.slice(0, 5)}: (${round(playerInfo.x, 2)}, ${round(playerInfo.y, 2)}) ${round(playerInfo.rotation, 2)}`);
        }
      });
    });
  });

  this.holdInputs = {
    'up': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
    'down': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
    'left': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
    'right': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    'alt_up': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    'alt_down': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    'alt_left': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    'alt_right': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  };
  this.pressInputs = {
    'rot_port': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    'lock_port': this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
  };
  this.inputs = {};
  Object.keys(this.holdInputs).forEach(function (input) {
    this.inputs[input] = false;
  }, this);
  this.down = {};
  Object.keys(this.pressInputs).forEach(function (input) {
    this.inputs[input] = false;
    this.down[input] = false;
  }, this);
}

function update() {
  var change = false;
  // Detect press and hold.
  Object.keys(this.holdInputs).forEach(function (input) {
    change |= this.inputs[input] !== this.holdInputs[input].isDown;
    this.inputs[input] = this.holdInputs[input].isDown;
  }, this);
  // Detect discrete press only.
  Object.keys(this.pressInputs).forEach(function (input) {
    const isPress = this.down[input] && !this.pressInputs[input].isDown;
    change |= this.input[input] !== isPress;
    this.inputs[input] = isPress;
    this.down[input] = this.pressInputs[input].isDown;
  }, this);
  if (change) this.socket.emit('playerInput', this.inputs);
}

function setPortColors(player, playerInfo) {
  Object.keys(playerInfo.ports).forEach(function (p) {
    if (playerInfo.ports[p]) {
      player.ports[p].setTint(getPortColor(PORT.LOCKED))
    } else {
      player.ports[p].clearTint();
    }
  }, player);
  if (!isNaN(playerInfo.selectedPort)) player.ports[playerInfo.selectedPort].setTint(getPortColor(playerInfo.portNeighbor ? (playerInfo.locking ? PORT.LOCKING : PORT.ACTIVE) : PORT.OPEN));
}

function getPortColor(portStatus) {
  switch (portStatus) {
    case PORT.OPEN:
      return 0x40ddf5;  // blue
		case PORT.ACTIVE:
      return 0x3beb6a;  // green
		case PORT.LOCKING:
      return 0xf0e441;  // yellow
		case PORT.LOCKED:
      return 0xfa3c3c;  // red
	}
}

function round(num, digits) {
  return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
}

function displayPlayers(self, playerInfo, sprite) {
  const container = self.add.container(playerInfo.x, playerInfo.y);
  const player = self.add.sprite(0, 0, sprite).setOrigin(0.5, 0.5).setDisplaySize(shipSize.width, shipSize.length);
  //const player = self.add.sprite(playerInfo.x, playerInfo.y, sprite).setOrigin(0.5, 0.5).setDisplaySize(shipSize.width, shipSize.length);

  // Add ports
  const ports = []
  ports[0] = self.add.sprite(0, shipSize.length / 2, 'port').setOrigin(0.5, 0.5).setDisplaySize(shipSize.port, shipSize.port);
  ports[1] = self.add.sprite(-shipSize.width / 4, 0, 'port').setOrigin(0.5, 0.5).setDisplaySize(shipSize.port, shipSize.port).setAngle(72.5);
  ports[2] = self.add.sprite(0, -shipSize.length / 2, 'port').setOrigin(0.5, 0.5).setDisplaySize(shipSize.port, shipSize.port);
  ports[3] = self.add.sprite(shipSize.width / 4, 0, 'port').setOrigin(0.5, 0.5).setDisplaySize(shipSize.port, shipSize.port).setAngle(-72.5);
  const playerLoc = self.add.text(shipSize.width / 2, shipSize.length / 2, `(${round(playerInfo.x, 2)}, ${round(playerInfo.y, 2)}) ${round(playerInfo.rotation, 2)}`);

  // Add all to container
  container.add([player, ports[0], ports[1], ports[2], ports[3], playerLoc]);
  container.ports = ports;
  container.loc = playerLoc;

  // Set port colors
  setPortColors(container, playerInfo);

  // Additional info
  container.playerId = playerInfo.playerId;
  // player.playerId = playerInfo.playerId
  self.players.add(container);
  if (container.playerId === self.socket.id) {
    self.cameras.main.startFollow(container);
  }
}
