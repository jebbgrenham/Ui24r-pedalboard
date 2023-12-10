"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainInterface = void 0;
const soundcraft_ui_connection_1 = require("soundcraft-ui-connection");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const child_process_1 = require("child_process");
function mainInterface(conn, display) {
    setTimeout(() => display.writeString('HELO'), 4000);
    console.log('main iface has been called');
    // Constants
    const Gpio = require('onoff').Gpio;
    const readline = require('readline');
    const LED_OFF = 0;
    const LED_ON = 1;
    const DEBOUNCE_TIMEOUT = 75;
    const ledPinNumbers = [9, 10, 11, 12];
    const pushButtonPins = [6, 7, 8];
    // Define modes
    const modes = ["mutesA", "mutesB", "player", "sampler"];
    const modesDisp = ["MUT.A", "MUT.B", "PLAY.", "SAMP."];
    let modeIndex = 0; //so that on initial handleMode we get mutes A
    let mode = "mutesA"; // You will regret changing this...
    setTimeout(() => display.writeString(modesDisp[modeIndex]), 6000);
    let longPressTimeout = null;
    console.log(mode);
    const modeButton = new Gpio(5, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });
    let modeButtonThreshold = false;
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
    modeButton.watch((err, value) => {
        if (!err) {
            if (value === 0) {
                // Button pressed, start the long press timeout
                longPressTimeout = setTimeout(() => {
                    modeButtonThreshold = true;
                    console.log('mode threshold met');
                }, 1500);
            }
            else if (value === 1) {
                // Button released, clear the long press timeout
                if (longPressTimeout) {
                    clearTimeout(longPressTimeout);
                    longPressTimeout = null;
                }
                if (modeButtonThreshold === true) {
                    handleModeChange();
                }
                else {
                    if (mode === "sampler") {
                        sampler(1);
                    }
                    else if (mode === "player") {
                        player(1);
                    }
                    else {
                        muter(1);
                    }
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
    const ledIndexMap = {
        mutesA: ['all', 'fx', 1, 2],
        mutesB: [3, 4, 5, 6],
    };
    // Create a map to track subscriptions
    const subscriptionMap = {};
    function setupButtons(mode) {
        if (mode === "sampler") {
            buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 2)));
        }
        else if (mode === "player") {
            buttons.forEach((button, index) => button.watch(handlePlayerEvent(index + 2)));
        }
        else {
            buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 2)));
        }
    }
    setupButtons(mode);
    // Initial LED subscription and mode setup
    function subscribeLED(LEDindex, LED) {
        let index = LEDindex;
        if (subscriptionMap[index]) {
            subscriptionMap[index].unsubscribe(); // Unsubscribe previous subscription
        }
        if (mode === "player") {
            if (index === 1) {
                subscriptionMap[index] = conn.player.state$.subscribe((state) => {
                    if (state === soundcraft_ui_connection_1.PlayerState.Playing) {
                        LED.writeSync(LED_ON);
                    }
                    else {
                        LED.writeSync(LED_OFF);
                    }
                });
            }
            else if (index === 4) {
                // Led4 is based on recorder state
                subscriptionMap[index] = conn.recorderMultiTrack.recording$.subscribe((recording) => {
                    if (recording == 1) {
                        LED.writeSync(LED_ON);
                    }
                    else {
                        LED.writeSync(LED_OFF);
                    }
                });
            }
        }
        else if (mode === "mutesA" || mode === "mutesB") {
            subscriptionMap[index] = conn.muteGroup(index).state$.subscribe((state) => {
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
    function muter(buttonNumber) {
        const group = ledIndexMap[mode][buttonNumber - 1];
        if (typeof group === 'number' || typeof group === 'string') {
            conn.muteGroup(group).toggle();
        }
        console.log('Pushed Button:', group);
    }
    function handleMuteEvent(buttonNumber) {
        return (err, value) => {
            if (!err) {
                muter(buttonNumber);
            }
        };
    }
    function sampler(buttonNumber) {
        // Turn on the LED
        let audio = null;
        leds[buttonNumber - 1].writeSync(LED_ON);
        if (audio) {
            (0, child_process_1.exec)('./alsamixer-fader/fade.sh 0 0.001');
            audio.kill(); // Stop audio playback if the button is pressed again
            leds[buttonNumber - 1].writeSync(LED_OFF);
            audio = null;
        }
        else {
            console.log('trying to play');
            const soundCommand = `amixer -q -M set "Soundcraft Ui24 " 100%; pw-play /home/admin/samples/${buttonNumber}.wav`;
            audio = (0, child_process_1.exec)(soundCommand, (err, stdout, stderr) => {
                if (err) {
                    console.log(`Could not play sound/sound stopped: ${err}`);
                }
                else {
                    console.log('Played sample', buttonNumber);
                    audio = null;
                }
                leds[buttonNumber - 1].writeSync(LED_OFF);
            });
        }
    }
    function handleSamplerEvent(buttonNumber) {
        return (err, value) => {
            if (!err) {
                sampler(buttonNumber);
            }
        };
    }
    function player(buttonNumber) {
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
    function handlePlayerEvent(buttonNumber) {
        return (err, value) => {
            if (!err) {
                player(buttonNumber);
            }
        };
    }
    function handlePlayerButton1() {
        let destroy$ = new rxjs_1.Subject();
        conn.player.state$
            .pipe((0, operators_1.takeUntil)(destroy$))
            .subscribe((state) => {
            if (state == soundcraft_ui_connection_1.PlayerState.Playing) {
                console.log('stopping');
                destroy$.next(); // Signal unsubscription
                destroy$.complete();
                conn.master.player(1).fadeTo(0, 3000);
                setTimeout(() => {
                    conn.player.pause();
                }, 3000);
            }
            else {
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
    // Initialize shutdown button 
    const shutdownButton = new Gpio(8, 'in', 'both', { debounceTimeout: DEBOUNCE_TIMEOUT });
    let isShutdownButtonPressed = false;
    let shutdownTimeout = null;
    function handleShutdown() {
        console.log('Shutting down...');
        executeShutdownCommand();
    }
    shutdownButton.watch((err, value) => {
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
        }
        else if (value === 1) {
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
    if (process.stdin.isTTY)
        process.stdin.setRawMode(true);
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
    function executeShutdownCommand() {
        (0, child_process_1.exec)('sudo shutdown -h now', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error during shutdown: ${error}`);
            }
            else {
                console.log('Shutdown initiated successfully.');
            }
        });
    }
    process.on('SIGINT', () => {
        unexportLEDs();
        unexportButtons();
        console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
        process.exit(0);
    });
} //end of mainInterface
exports.mainInterface = mainInterface;
