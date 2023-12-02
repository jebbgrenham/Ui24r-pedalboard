import { SoundcraftUI } from 'soundcraft-ui-connection';
import { PlayerState, MtkState } from 'soundcraft-ui-connection';
import { interval, Subscription } from 'rxjs';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const player = require('play-sound')();
const Gpio = require('onoff').Gpio;
const readline = require('readline');

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
  if (mode === "player") {
    if (index === 1) {
      subscriptionMap[index] = conn.player.state$.subscribe((state: PlayerState) => {
        if (state === PlayerState.Playing) {
          LED.writeSync(1);
        } else {
          LED.writeSync(0);
        }
      });
    } else if (index === 4) {
      // Led4 is based on recorder state
      subscriptionMap[index] = conn.recorderMultiTrack.recording$.subscribe((recording: number) => {
        if (recording == 1) {
          LED.writeSync(1);
        } else {
          LED.writeSync(0);
        }
      });
    }
  } else if (mode === "mutesA" || mode === "mutesB") {
    subscriptionMap[index] = conn.muteGroup(index as any).state$.subscribe((state) => {
      LED.writeSync(state);
      console.log(`Read index: ${LEDindex} and set to:`, LED.readSync());
    });
  } else {
    // Retain the original behavior for other modes
  }
}

function unsubscribeLEDs() {
  for (const led of leds) {
    led.writeSync(0); // Turn off the LED
  }

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
      // Turn on the LED
      leds[buttonNumber - 1].writeSync(1);
      if (audio) {
        audio.kill(); // Stop audio playback if button is pressed again
        leds[buttonNumber - 1].writeSync(0);
        audio = null;
      } else {
        console.log('trying to play')
        audio = player.play('/home/admin/samples/' + buttonNumber + '.wav', (err: string | null) => {
          if (err) {
            console.log(`Could not play sound/sound stopped: ${err}`);
          } else {
            console.log('Played sample', buttonNumber);
            audio = null;
          }
          leds[buttonNumber - 1].writeSync(0);
        });
      }
    }
  };
}

function handlePlayerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      if (buttonNumber == 1) {
        // Create a new destroy$ subject for each button press
        let destroy$ = new Subject<void>();

        // Subscribe to player state with takeUntil
        conn.player.state$
          .pipe(takeUntil(destroy$))
          .subscribe((state: PlayerState) => {
            if (state == PlayerState.Playing) {
              console.log('stopping');
              destroy$.next(); // Signal unsubscription
              destroy$.complete();
              conn.master.player(1).fadeTo(0, 3000);
              setTimeout(() => {
                conn.player.pause();
              }, 3000);
            } else {
              console.log('playing');
              conn.player.play();
              conn.master.player(1).fadeToDB(-25, 3000);
              destroy$.next(); // Signal unsubscription
              destroy$.complete();
            }
          });
      } else if (buttonNumber == 2) {
        conn.player.prev();
      } else if (buttonNumber == 3) {
        conn.player.next();
      } else if (buttonNumber == 4) {
        conn.recorderMultiTrack.recordToggle();
      }
    }
  };
}

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
const modeButton = new Gpio(4, 'in', 'both', { debounceTimeout: 75 });

let isModeButtonPressed = false;
let shutdownTimeout: NodeJS.Timeout | null = null;

// Function to handle mode change
function handleModeChange() {
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

// Function to handle shutdown
function handleShutdown() {
  console.log('Shutting down...');
  executeShutdownCommand();
}

modeButton.watch((err: any, value: any) => {
  if (err) {
    throw err;
  }

  if (value === 0) {
    // Button pressed
    isModeButtonPressed = true;
    shutdownTimeout = setTimeout(() => {
      if (isModeButtonPressed) {
        handleShutdown();
      }
      shutdownTimeout = null;
    }, 3000);
  } else if (value === 1) {
    // Button released
    if (isModeButtonPressed) {
      handleModeChange();
    }
    isModeButtonPressed = false;

    // Clear the shutdown timeout if it exists
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }
  }
});

function updateSubscriptions() {
  unsubscribeLEDs();
  const indexes = ledIndexMap[mode];
  if (indexes) {
    for (let i = 0; i < leds.length; i++) {
      subscribeLED(indexes[i], leds[i]);
    }
  }

  // Check for "player" mode and explicitly call subscribeLED for LEDs 1 and 4
  if (mode === "player") {
    subscribeLED(1, LED1);
    subscribeLED(4, LED4);
  }
}

// listen to keypress
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on("keypress", (str, key) => {
  if (key.name == "m") {
    console.log("M")
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

function executeShutdownCommand() {
  const exec = require('child_process').exec;

  exec('sudo shutdown -h now', (error: Error | null, stdout: string, stderr: string) => {
    if (error) {
      console.error(`Error during shutdown: ${error}`);
    } else {
      console.log('Shutdown initiated successfully.');
    }
  });
}

process.on('SIGINT', unexportOnClose); // ctrl+c handling

