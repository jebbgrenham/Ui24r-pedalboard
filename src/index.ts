import { SoundcraftUI } from 'soundcraft-ui-connection';
import { interval } from 'rxjs';
const player = require('play-sound')();
const Gpio = require('onoff').Gpio;

// Initialize the Soundcraft UI connection
const conn = new SoundcraftUI("10.0.1.2");
conn.connect();

// Define your modes and initial mode
const modes = ["mutesA", "mutesB", "sampler", "player"];
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
  mutesA: [1, 2, 3, 4],
  mutesB: [5, 6, 'fx', 'all'],
};

// Create a map to track subscriptions
const subscriptionMap: { [index: number | string]: any } = {};

// Function to subscribe LEDs
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

// Function to unsubscribe LEDs
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


// Function to handle sampler events
function handleSamplerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      var audio = player.play('./samples/' + buttonNumber + '.wav', (err: string) => {
        if (err) console.log(`Could not play sound: ${err}`);
        pushButton1.watch(audio.kill());  
        console.log('Played sample', buttonNumber);
      });
    }
  };
}


function handlePlayerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
/*      player.play('./samples/' + buttonNumber + '.wav', (err: string) => {
        if (err) console.log(`Could not play sound: ${err}`);
        console.log('Played sample', buttonNumber);
      });
*/      
    }
  };

}

// Function to stop button listeners
function stopButtonListeners() {
  buttons.forEach((button) => button.unwatchAll());
}

// Set mode to "mutesA" when the program starts
let mode: string = "mutesA";
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
    mode = modes[modeIndex]; // Update the mode variable
    console.log('Mode now', mode);
    updateSubscriptions();
// Handle button events based on the mode
  if (mode === "sampler") {
    buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
  } else if (mode === "player") {
    buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 1)));
  } else {
    buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));
  }
}
});

// Function to update LED subscriptions based on the current mode
function updateSubscriptions() {
  unsubscribeLEDs(); // Unsubscribe from previous subscriptions
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

process.on('SIGINT', unexportOnClose); // Function to run when the user closes using Ctrl+C

