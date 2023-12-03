import { SoundcraftUI } from 'soundcraft-ui-connection';
import { interval, Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { exec, ExecException } from 'child_process';
import * as os from 'os';
const ping = require('ping');

let conn: SoundcraftUI;

// Function to get the subnet based on the device's IP on wlan0
function getSubnet(): string | null {
  const networkInterfaces = os.networkInterfaces();
  const wlan0Interface = networkInterfaces['wlan0'];

  if (wlan0Interface) {
    const ipAddress = wlan0Interface.find((info) => info.family === 'IPv4')?.address;

    if (ipAddress) {
      // Assuming the subnet is in the format 'xxx.xxx.xxx'
      const subnet = ipAddress.split('.').slice(0, 3).join('.');
      return subnet;
    }
  }

  return null;
}

async function discoverSoundcraftUI(): Promise<string | null> {
  const subnet = getSubnet();
  console.log("Subnet is ", subnet)
  if (subnet) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const pingPromises: Promise<[string, boolean] | null>[] = [];

      for (let i = 1; i <= 255; i++) {
        const ip = `${subnet}.${i}`;
        pingPromises.push(pingAndCheck(ip));
      }

      const results = await Promise.all(pingPromises);

      for (const result of results) {
        if (result && result[1]) {
          const connectedIP = await attemptConnection(result[0]);
          if (connectedIP) {
            return connectedIP;
          }
        }
      }
    }
  }

  return null; // No reachable device found after 5 attempts
}

async function pingAndCheck(ip: string): Promise<[string, boolean] | null> {
  try {
    const result: any = await ping.promise.probe(ip);
    return [ip, result.alive];
  } catch (error) {
    return null;
  }
}

// ...


async function attemptConnection(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    conn = new SoundcraftUI(ip);

    // Subscribe to status changes
    const statusSubscription = conn.status$.subscribe(status => {
      //console.log('Connection status:', status);

      if (status.type === 'OPEN') {
        // Connection successful, complete the Promise
        console.log('Ah excellent! Here is a mixer I can talk to')
        statusSubscription.unsubscribe();
        resolve(ip);
      } else if (status.type === 'ERROR') {
        // Connection error, move on to the next IP
        console.log('Nope,', ip, 'is not a mixer :\(')
        statusSubscription.unsubscribe();
        resolve(null);
      }
    });

    try {
      // Connect and wait for the operation to finish
      conn.connect().then(() => {
        // Handle cases where 'OPEN' status is not reached
        console.error(`Connection to ${ip} did not reach 'OPEN' status.`);
        resolve(null);
      });
    } catch (error) {
      // Handle connection errors
      console.error(`Connection to ${ip} failed:`, error);
      resolve(null);
    }
  });
}

// ...

async function initializeSoundcraftUIConnection(): Promise<boolean> {
  const discoveredIP = await discoverSoundcraftUI();

  if (!discoveredIP) {
    console.error('No SoundcraftUI device found on the network.');
    return false;
  }

  console.log('Connected to SoundcraftUI at:', discoveredIP);
  return true;
}

async function main() {
  if (!(await initializeSoundcraftUIConnection())) {
    console.log('No connection')
    // i2c display ERRC
    return;
  }

  // Code here will only run if the connection is successfully established.
  console.log('CONNECTION MADE')
  //call the main interface
}

main(); // Call the asynchronous function to start the execution.
