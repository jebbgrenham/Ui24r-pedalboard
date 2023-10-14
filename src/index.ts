import { SoundcraftUI } from 'soundcraft-ui-connection';
import { interval } from 'rxjs';
const player = require('play-sound')();
const Gpio = require('onoff').Gpio;

// Initialize
const conn = new SoundcraftUI("10.0.1.2");
conn.connect();

// Define modes 
const modes = ["mutesA", "mutesB", "player", "sampler"];
let modeIndex = 0;

// Define LED and button pins
const ledPinNumbers = [9, 10, 11, 12];
const pushButtonPins = [5, 6, 7, 8];
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: 75 }));

// LED and button arrays
const [LED1, LED2, LED3, LED4] = LED;
const [pushButton1, pushButton2, pushButton3, pushButton4] = pushButtons;
const buttons = [pushButton1, pushButton2, pushButton3, pushButton4];
const leds = [LED1, LED2, LED3, LED4];

// Define the LED index mapping
const ledIndexMap: { [mode: string]: (number | string)[] } = {
  mutesA: ['all', 'fx', 1, 2],
  mutesB: [3, 4, 5, 6],
};

// Create a map to track subscriptions
const subscriptionMap: { [index: number | string]: any } = {};

function subscribeLED(LEDindex: number | string, LED: { writeSync: (state: number) => void, readSync: () => number }) {
  let index: number | string = LEDindex;
  if (subscriptionMap[index]) {
    subscriptionMap[index].unsubscribe(); // Unsubscribe previous subscription
  }
  subscriptionMap[index] = conn.muteGroup(index as any).state$.subscribe((state) => {
    LED.writeSync(state);
    console.log(`Read index: ${LEDindex} and set to:`, LED.readSync());
  });
}

function unsubscribeLEDs() {
  for (const index in subscriptionMap) {
    if (subscriptionMap.hasOwnProperty(index)) {
      subscriptionMap[index].unsubscribe();
      delete subscriptionMap[index];
    }
  }
}

function handleMuteEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      const group = ledIndexMap[mode][buttonNumber - 1];
      console.log(mode);
      console.log(group);
      if (typeof group === 'number') {
        conn.muteGroup(group as any).toggle();
      } else if (typeof group === 'string') {
        conn.muteGroup(group as any).toggle();
      }
      console.log('Pushed Button:', group);
    }
  };
}

function handleSamplerEvent(buttonNumber: number) {
  let audio: any = null;

  return (err: string | null, value: string | null) => {
    if (!err) {
      if (audio) {
        audio.kill(); // Stop audio playback if the same button is pressed again
        audio = null;
      } else {
        audio = player.play('./samples/' + buttonNumber + '.wav', (err: string | null) => {
          if (err) {
            console.log(`Could not play sound: ${err}`);
          } else {
            console.log('Played sample', buttonNumber);
            audio = null;
          }
        });
      }
    }
  };
}

function handlePlayerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      if (buttonNumber == 1 ){
//      conn.player.loadPlaylist('Music')
//      conn.player.setShuffle(1)	
//      conn.player.next()
      conn.player.play()  
      conn.master.player(1).fadeToDB(-25, 3000) 
      }
      else if (buttonNumber == 2 ) { 
        conn.master.player(1).fadeTo(0, 3000)
        setTimeout(() => {
          conn.player.pause();
          }, 3000); 
        }
      else if (buttonNumber == 3 ) { conn.player.next() }
      else if (buttonNumber == 4 ) { conn.recorderMultiTrack.recordToggle() }
    };
  }
};

function stopButtonListeners() {
  buttons.forEach((button) => button.unwatchAll());
}

let mode: string = "mutesA"; //you will regret changing this...
console.log(mode)
const initialIndexes = ledIndexMap[mode];
updateSubscriptions();

// Watch buttons
buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));

// Initialize mode button and set up mode change logic
const modeButton = new Gpio(4, 'in', 'rising', { debounceTimeout: 75 });
modeButton.watch((err: any, value: any) => {
  if (err) {
    throw err;
  }
  if (value === 1) {
    stopButtonListeners();
    modeIndex = (modeIndex + 1) % modes.length;
    mode = modes[modeIndex];
    console.log('Mode now', mode);
    updateSubscriptions();
// Handle button events per mode
  if (mode === "sampler") {
    buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
  } else if (mode === "player") {
    buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 1)));
  } else {
    buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));
  }
}
});

// Update LED subscriptions based on the mode
function updateSubscriptions() {
  unsubscribeLEDs();
  const indexes = ledIndexMap[mode];
  if (indexes) {
    for (let i = 0; i < leds.length; i++) {
      subscribeLED(indexes[i], leds[i]);
    }
  }
}

// Handle program termination and unexport GPIO pins
function unexportOnClose() {
  leds.forEach((led) => {
    led.writeSync(0);
    led.unexport();
  });

  pushButtons.forEach((button) => {
    button.unexport();
  });
}

process.on('SIGINT', unexportOnClose); // ctrl+c handling

