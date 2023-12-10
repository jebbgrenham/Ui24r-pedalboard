import { SoundcraftUI } from 'soundcraft-ui-connection';
import { PlayerState, MtkState } from 'soundcraft-ui-connection';
import { interval, Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { exec, ExecException } from 'child_process';

export function mainInterface(conn: SoundcraftUI) {
  console.log('main iface has been called')
  // Constants
  const Gpio = require('onoff').Gpio;
  const readline = require('readline');
  const LED_OFF = 0;
  const LED_ON = 1;
  const DEBOUNCE_TIMEOUT = 75;
  const ledPinNumbers = [9, 10, 11, 12];
  const pushButtonPins = [5, 6, 7, 8];

  // Define modes
  const modes = ["mutesA", "mutesB", "player", "sampler"];
  let modeIndex = 0; //so that on initial handleMode we get mutes A
  let mode: string = "mutesA"; // You will regret changing this...

  let longPressTimeout: NodeJS.Timeout | null = null;

console.log(mode);

  const modeButton = new Gpio(5, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });
  // Listen for a long press on button 4 (GPIO 5)
  function handleModeChangeLongPress() {
    console.log('CALLED handleModeChangeLongPress')
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
      console.log('Longpresstimeout cleared')
      // Long press on button 1, handle mode change
      handleModeChange();
    }
  } 

  function watchModeButton() {
    console.log('CALLED Watchmodebutton')
    // Watch for both rising and falling edges of the modeButton
    modeButton.watch((err: any, value: any) => {
      if (!err) {
        if (value === 0) {
          // Button pressed, start the long press timeouti
          console.log('mode pressed start timeout')
          longPressTimeout = setTimeout(() => {
            handleModeChangeLongPress();
            console.log('CHANGING MODE LONG PRESS?');
          }, 2000);
        } else if (value === 1) {
          console.log('modebutton released ')
          // Button released, clear the long press timeout
         if (longPressTimeout) {
            console.log('clearing the timeout')
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
         } 
        }
      }
    });
  }  
  watchModeButton()

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


  let isButtonListenerPaused = false;
   
  function setupButtons(mode: string) {
    if (mode === "sampler") {
          buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
        } else if (mode === "player") {
          buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 1)));
        } else {
          buttons.forEach((button, index) =>
          button.watch(handleMuteEvent(index + 1)));
        }
  }
  setupButtons(mode)

  // Initial LED subscription and mode setup
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
        //console.log(`Read index: ${LEDindex} and set to:`, LED.readSync());
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
    if (!isButtonListenerPaused) {    
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
  }



  function handleSamplerEvent(buttonNumber: number) {
      if (!isButtonListenerPaused) {
        let audio: any = null;

        return (err: ExecException | null, value: string | null) => {
          if (!err) {
            // Turn on the LED
            leds[buttonNumber - 1].writeSync(LED_ON);
            if (audio) {
              console.log('Vol to 0')
              exec('./alsamixer-fader/fade.sh 0 0.001');
              audio.kill(); // Stop audio playback if the button is pressed again
              leds[buttonNumber - 1].writeSync(LED_OFF);
              audio = null;
            } else {
              console.log('trying to play');
              const soundCommand = `amixer -q -M set "Soundcraft Ui24 " 100%; pw-play /home/admin/samples/${buttonNumber}.wav`;

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

    modeButton.watch((err: any, value: any) => {
      if (!err && value === 1) {
        console.log('released mode')
        setupButtons(mode)
        modeButton.unwatch();
        watchModeButton();
      }
    });
  }




  // Initialize shutdown button 
  const shutdownButton = new Gpio(8, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });
  let isShutdownButtonPressed = false;
  let shutdownTimeout: NodeJS.Timeout | null = null;
  
  function handleShutdown() {
    console.log('Shutting down...');
    executeShutdownCommand();
  }

  shutdownButton.watch((err: any, value: any) => {
    if (err) {
      throw err;
    }

    if (value === 0) {
      isShutdownButtonPressed = true;
      shutdownTimeout = setTimeout(() => {
        if (isShutdownButtonPressed) {
          handleShutdown();
        }
        shutdownTimeout = null;
      }, 3000);
    } else if (value === 1) {
      isShutdownButtonPressed = false;

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
  updateSubscriptions();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

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

process.on('SIGINT', () => {
  unexportOnClose();
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  process.exit(0);
});
  

} //end of mainInterface


