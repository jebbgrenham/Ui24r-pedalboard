import { SoundcraftUI } from 'soundcraft-ui-connection';

console.log('Welcome application');

const conn = new SoundcraftUI("10.0.1.2");
conn.connect();

console.log(conn);

//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout


