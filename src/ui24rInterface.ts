import { SoundcraftUI } from 'soundcraft-ui-connection';
import { PlayerState, MtkState } from 'soundcraft-ui-connection';
import { interval, Subscription, Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { exec, ExecException } from 'child_process';

export function mainInterface(conn: SoundcraftUI,display) {
  setTimeout(() => display.writeString('HELO'), 4000);

  console.log('main iface has been called')
  // Constants
  const Gpio = require('onoff').Gpio;
  const readline = require('readline');
  const LED_OFF = 0;
  const LED_ON = 1;
  const DEBOUNCE_TIMEOUT = 125;
  const ledPinNumbers = [9, 10, 11, 12];
  const pushButtonPins = [6, 7, 8];
  const BLINK_DURATION_ON = 300;
  const BLINK_DURATION_OFF = 300;
  
  // Define modes
  const modes = ["mutesA", "mutesB", "player", "sampler"];
  const modesDisp = ["MUT.A", "MUT.B", "PLAY.", "SAMP."];
  let modeIndex = 0; //so that on initial handleMode we get mutes A
  let mode: string = "mutesA"; // You will regret changing this...
  setTimeout(() => display.writeString(modesDisp[modeIndex]), 6000);
  let longPressTimeout: NodeJS.Timeout | null = null;
  console.log(mode);

  const modeButton = new Gpio(5, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });
  let modeButtonThreshold = false;

  function blinkLED(LED) {
    let isOn = false;
    const iv = setInterval(() => {
      isOn = !isOn;
      LED.writeSync(isOn ? 1 : 0); // Synchronous write
    }, 300); // Adjust the interval as needed

    // Return a function to stop blinking
    return () => {
      clearInterval(iv);
      LED.writeSync(0); // Ensure the LED is off when not blinking
    };
  }

  function handleModeChange() {
    stopButtonListeners();
    modeIndex = (modeIndex + 1) % modes.length;
    mode = modes[modeIndex];
    display.writeString(modesDisp[modeIndex]);
    console.log('Mode now', mode);
    updateSubscriptions();
    setupButtons(mode);
  } 

  // Watch for both rising and falling edges of the modeButton
  modeButton.watch((err: any, value: any) => {
    if (!err) {
      if (value === 0) {
        // Button pressed, start the long press timeout
        longPressTimeout = setTimeout(() => {
          modeButtonThreshold = true;
          console.log('mode threshold met');
          display.writeString('MODE')
        }, 1200);
      } else if (value === 1) {
        // Button released, clear the long press timeout
        if (longPressTimeout) {
          clearTimeout(longPressTimeout);
          longPressTimeout = null;
        } 
        if (modeButtonThreshold === true) {
           handleModeChange();
        } else {
          if (mode === "sampler") { sampler(1); }
          else if (mode === "player") { player(1); }
          else { muter(1); }
        }
        
        modeButtonThreshold = false;
      }
    }
  });
 
  const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: DEBOUNCE_TIMEOUT }));
  
  // LED and button arrays
  // Define LED and button pins
  const [LED1, LED2, LED3, LED4] = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
  const [pushButton2, pushButton3, pushButton4] = pushButtons;
  const buttons = [pushButton2, pushButton3, pushButton4];
  const leds = [LED1, LED2, LED3, LED4];

  // Define the LED index mapping
  const ledIndexMap: { [mode: string]: (number | string)[] } = {
    mutesA: ['all', 'fx', 1, 2],
    mutesB: [3, 4, 5, 6],
  };

  // Create a map to track subscriptions
  const subscriptionMap: { [index: number | string]: Subscription } = {};
  
  function setupButtons(mode: string) {
    if (mode === "sampler") {
          buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 2)));
        } else if (mode === "player") {
          buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 2)));
        } else {
          buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 2)));
        }
  }
  setupButtons(mode)

  // Modify the subscribeLED function to use blinkLED
  function subscribeLED(LEDindex, LED) {
    let index: number | string = LEDindex;
    let stopBlinking: (() => void) | null = null;

    if (subscriptionMap[index]) {
      subscriptionMap[index].unsubscribe(); // Unsubscribe previous subscription
    }

    if (mode === "player") {
      if (index === 1) {
        subscriptionMap[index] = conn.player.state$.subscribe((state: PlayerState) => {
          if (state === PlayerState.Playing && !stopBlinking) {
            // Start blinking and store the stopBlinking function
            stopBlinking = blinkLED(LED);
          } else if (state !== PlayerState.Playing && stopBlinking) {
            // Stop blinking and revert to the subscription
            stopBlinking();
            stopBlinking = null;
          }

          // Update the LED state based on the player state
          if (state !== PlayerState.Playing) {
            LED.writeSync(0);
          }
        });
      } else if (index === 4) {
        // Led4 is based on recorder state
        subscriptionMap[index] = conn.recorderMultiTrack.recording$.subscribe((recording: number) => {
          if (recording == 1 && !stopBlinking) {
            // Start blinking and store the stopBlinking function
            stopBlinking = blinkLED(LED);
          } else if (recording !== 1 && stopBlinking) {
            // Stop blinking and revert to the subscription
            stopBlinking();
            stopBlinking = null;
          }

          // Update the LED state based on the recorder state
          if (recording !== 1) {
            LED.writeSync(0);
          }
        });
      }
    } else if (mode === "mutesA" || mode === "mutesB") {
      subscriptionMap[index] = conn.muteGroup(index as any).state$.subscribe((state) => {
        LED.writeSync(state);
      });
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

  function muter (buttonNumber){
    const group = ledIndexMap[mode][buttonNumber - 1];
    if (typeof group === 'number' || typeof group === 'string') {
      conn.muteGroup(group as any).toggle();
    }
    console.log('Pushed Button:', group);
    let grp = String(group);
    display.writeString('M.' + grp.toUpperCase());
    setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
  }

  function handleMuteEvent(buttonNumber: number) {
        return (err: string, value: string) => {
          if (!err) {
            muter(buttonNumber);
          }
        };
  }

  function sampler(buttonNumber) {
    // Turn on the LED
    let audio: any = null;
    blinkLED(leds[buttonNumber - 1]);
    if (audio) {
      exec('./fade.sh 0 0.001');
      audio.kill(); // Stop audio playback if the button is pressed again
      leds[buttonNumber - 1].writeSync(LED_OFF);
      audio = null;
    } else {
      console.log('trying to play');
      display.writeString('SAM.'+buttonNumber+'.');
      setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
//      const soundCommand = `amixer -q -M set "Soundcraft Ui24 " 100%; pw-play /home/admin/samples/${buttonNumber}.wav`;
//NONE OF THIS WILL WORK UNTIL THE PCM BOARD IS CONNECTED
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

  function handleSamplerEvent(buttonNumber: number) {
        return (err: ExecException | null, value: string | null) => {
          if (!err) {
            sampler(buttonNumber);
          }
        };
  }

  function player(buttonNumber) {
      switch (buttonNumber) {
        case 1:
          display.writeString('USB');
          setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
          handlePlayerButton1();
          break;
        case 2:
          display.writeString('BACK');
          setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
          conn.player.prev();
          break;
        case 3:
          display.writeString('NEXT');
          setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
          conn.player.next();
          break;
        case 4:
          display.writeString('REC*');
          setTimeout(() => display.writeString(modesDisp[modeIndex]), 1000);
          conn.recorderMultiTrack.recordToggle();
          break;
      }
  }

  function handlePlayerEvent(buttonNumber: number) {
    return (err: string, value: string) => {
      if (!err) {
        player(buttonNumber);
      }
    };
  }

  let playerLevel: number = 0;  
  function handlePlayerButton1() {
    let destroy$ = new Subject<void>();
    conn.master.player(1).faderLevel$.pipe(
      take(1)
    ).subscribe(value => {
      playerLevel = value;
    });

      conn.player.state$
      .pipe(takeUntil(destroy$))
      .subscribe((state: PlayerState) => {
        if (state == PlayerState.Playing) {
          //console.log('stopping. 241', playerLevel);
          destroy$.next(); // Signal unsubscription
          destroy$.complete();
          conn.master.player(1).fadeTo(0, 3000);
          setTimeout(() => {
            conn.player.pause();
            setTimeout(() => { conn.master.player(1).setFaderLevel(playerLevel); }, 750);
          }, 3000);
        } else {
          console.log('playing');
          conn.player.loadPlaylist('Music')	
          conn.player.setShuffle(1)
          conn.master.player(1).setFaderLevel(0);
          conn.player.play();
          setTimeout(() => { conn.master.player(1).fadeTo(playerLevel, 3000); }, 750);
          destroy$.next(); // Signal unsubscription
          destroy$.complete();
        }
      });
  }
  
  function stopButtonListeners() {
    buttons.forEach((button) => button.unwatchAll());
  }


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
  updateSubscriptions();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function unexportLEDs() {
    leds.forEach((led) => {
      led.writeSync(LED_OFF);
      led.unexport();
    });
  }
  function unexportButtons() {
    pushButtons.forEach((button) => {
      button.unexport();
    });
  }

  process.on('SIGINT', () => {
    display.writeString('BYE.{')
    unexportLEDs();
    unexportButtons();
    console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
    process.exit(0);
  });
  

} //end of mainInterface


