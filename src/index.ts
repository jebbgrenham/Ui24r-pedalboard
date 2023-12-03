import { SoundcraftUI } from 'soundcraft-ui-connection';
import { PlayerState, MtkState } from 'soundcraft-ui-connection';
import { interval, Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { exec, ExecException } from 'child_process';
import * as os from 'os';
const ping = require('ping');



// Constants
const Gpio = require('onoff').Gpio;
const readline = require('readline');
const LED_OFF = 0;
const LED_ON = 1;
const DEBOUNCE_TIMEOUT = 75;
const ledPinNumbers = [9, 10, 11, 12];
const pushButtonPins = [5, 6, 7, 8];

// Initialize - OLD single network static IP.
//const conn = new SoundcraftUI("10.0.1.2");
//conn.connect();

// Function to get the subnet based on the device's IP on wlan0
function getSubnet(): string | null {
  const networkInterfaces = os.networkInterfaces();
  const wlan0Interface = networkInterfaces['wlan0'];

  if (wlan0Interface) {
    const ipAddress = wlan0Interface.find((info) => info.family === 'IPv4')?.address;

    if (ipAddress) {
      // Assuming the subnet is in the format 'xxx.xxx.xxx'
      console.log('IP is ', ipAddress)
      const subnet = ipAddress.split('.').slice(0, 3).join('.');
      return subnet;
    }
  }

  return null;
}

// Function to check if a device is reachable
async function isDeviceReachable(ip: string): Promise<boolean> {
  try {
    const result: any = await ping.promise.probe(ip);
    return result.alive;
  } catch (error) {
    return false;
  }
}

// Function to find the SoundcraftUI device on the network
async function discoverSoundcraftUI(): Promise<string | null> {
  const subnet = getSubnet();

  if (subnet) {
    for (let i = 1; i <= 255; i++) {
      const ip = `${subnet}.${i}`;
      const isReachable = await isDeviceReachable(ip);

      if (isReachable) {
        return ip;
      }
    }
  }

  return null; // No reachable device found
}

// Initialize the SoundcraftUI connection
let conn: SoundcraftUI = null;

async function initializeSoundcraftUIConnection(): Promise<void> {
  const discoveredIP = await discoverSoundcraftUI();

  if (discoveredIP) {
    conn = new SoundcraftUI(discoveredIP);
    conn.connect();
  } else {
    console.error('No SoundcraftUI device found on the network.');
  }
}

// Call the function to start the initialization
initializeSoundcraftUIConnection();


// Define modes
const modes = ["mutesA", "mutesB", "player", "sampler"];
let modeIndex = 3; //so that on initial handleMode we get mutes A
let mode: string = "sampler"; // You will regret changing this...
console.log(mode);

// Define LED and button pins
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: DEBOUNCE_TIMEOUT }));

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
const subscriptionMap: { [index: number | string]: Subscription } = {};

// Initial LED subscription and mode setup
handleModeChange();

function subscribeLED(LEDindex: number | string, LED: { writeSync: (state: number) => void, readSync: () => number }) {
  let index: number | string = LEDindex;
  if (subscriptionMap[index]) {
    subscriptionMap[index].unsubscribe(); // Unsubscribe previous subscription
  }
  if (mode === "player") {
    if (index === 1) {
      subscriptionMap[index] = conn.player.state$.subscribe((state: PlayerState) => {
        if (state === PlayerState.Playing) {
          LED.writeSync(LED_ON);
        } else {
          LED.writeSync(LED_OFF);
        }
      });
    } else if (index === 4) {
      // Led4 is based on recorder state
      subscriptionMap[index] = conn.recorderMultiTrack.recording$.subscribe((recording: number) => {
        if (recording == 1) {
          LED.writeSync(LED_ON);
        } else {
          LED.writeSync(LED_OFF);
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
    led.writeSync(LED_OFF); // Turn off the LED
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
      if (typeof group === 'number' || typeof group === 'string') {
        conn.muteGroup(group as any).toggle();
      }
      console.log('Pushed Button:', group);
    }
  };
}



function handleSamplerEvent(buttonNumber: number) {
  let audio: any = null;

  return (err: ExecException | null, value: string | null) => {
    if (!err) {
      // Turn on the LED
      leds[buttonNumber - 1].writeSync(LED_ON);
      if (audio) {
        audio.kill(); // Stop audio playback if the button is pressed again
        leds[buttonNumber - 1].writeSync(LED_OFF);
        audio = null;
      } else {
        console.log('trying to play');
        const soundCommand = `pw-play /home/admin/samples/${buttonNumber}.wav`;

        audio = exec(soundCommand, (err, stdout, stderr) => {
          if (err) {
            console.log(`Could not play sound/sound stopped: ${err}`);
          } else {
            console.log('Played sample', buttonNumber);
            audio = null;
          }
          leds[buttonNumber - 1].writeSync(LED_OFF);
        });
      }
    }
  };
}

function handlePlayerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      switch (buttonNumber) {
        case 1:
          handlePlayerButton1();
          break;
        case 2:
          conn.player.prev();
          break;
        case 3:
          conn.player.next();
          break;
        case 4:
          conn.recorderMultiTrack.recordToggle();
          break;
      }
    }
  };
}

function handlePlayerButton1() {
  let destroy$ = new Subject<void>();

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
}

function stopButtonListeners() {
  buttons.forEach((button) => button.unwatchAll());
}

function handleModeChange() {
  stopButtonListeners();
  modeIndex = (modeIndex + 1) % modes.length;
  mode = modes[modeIndex];
  console.log('Mode now', mode);
  updateSubscriptions();

  if (mode === "sampler") {
    buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
  } else if (mode === "player") {
    buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 1)));
  } else {
    buttons.forEach((button, index) =>
    button.watch(handleMuteEvent(index + 1)));
  }
}

// Initialize mode button and set up mode change logic
const modeButton = new Gpio(4, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });

let isModeButtonPressed = false;
let shutdownTimeout: NodeJS.Timeout | null = null;

function handleShutdown() {
  console.log('Shutting down...');
  executeShutdownCommand();
}

modeButton.watch((err: any, value: any) => {
  if (err) {
    throw err;
  }

  if (value === 0) {
    isModeButtonPressed = true;
    shutdownTimeout = setTimeout(() => {
      if (isModeButtonPressed) {
        handleShutdown();
      }
      shutdownTimeout = null;
    }, 3000);
  } else if (value === 1) {
    if (isModeButtonPressed) {
      handleModeChange();
    }
    isModeButtonPressed = false;

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

  if (mode === "player") {
    subscribeLED(1, LED1);
    subscribeLED(4, LED4);
  }
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
/*
process.stdin.on("keypress", (str, key) => {
  if (key.name == "m") {
    console.log("M");
    stopButtonListeners();
    modeIndex = (modeIndex + 1) % modes.length;
    mode = modes[modeIndex];
    console.log('Mode now', mode);
    updateSubscriptions();

    if (mode === "sampler") {
      buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
    } else if (mode === "player") {
      buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 1)));
    } else {
      buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));
    }
  }
});
*/
function unexportOnClose() {
  leds.forEach((led) => {
    led.writeSync(LED_OFF);
    led.unexport();
  });

  pushButtons.forEach((button) => {
    button.unexport();
  });
}

function executeShutdownCommand() {
  exec('sudo shutdown -h now', (error: Error | null, stdout: string, stderr: string) => {
    if (error) {
      console.error(`Error during shutdown: ${error}`);
    } else {
      console.log('Shutdown initiated successfully.');
    }
  });
}

process.on('SIGINT', unexportOnClose);

