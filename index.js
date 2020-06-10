const SerialPort = require('serialport')
const net = require('net');
const port = new SerialPort('COM4', {
    baudRate: 38400,
    stopBits:1,
    parity: 'odd'
})
let buff = Buffer.alloc(40);
let curr = 0;

const speedFactor = 17; //number of frames per jog

var client = new net.Socket();
client.connect(8099, '127.0.0.1', function() {
    console.log('Connected');
    client.on('data', data => console.log(data.toString()))
});

port.on('data', (data) => {
    data.copy(buff, curr, 0, data.length);
    curr += data.length;
    if (curr >= 4) decodeBuffer();
})

function decodeBuffer() {
    let cmd1 = (buff[0] & 0xf0) >> 4;
    if (cmd1 > 7) return console.error('decode error');
    let len = (buff[0] & 0xf);
    if (len > 15 && cmd1 != 3) return console.error('decode error');
    if (cmd1 != 3) {
        let data = Buffer.alloc(len+3);
        buff.copy(data, 0, 0, len+3);
        let cmd2 = data[1];
        let args = Buffer.alloc(len);
        data.copy(args, 0, 2, len+2);
        if (verifyChecksum(data)) runCommand(cmd1, cmd2, [...args]);
        else console.error('checksum error');
    } else {
        len = buff[1];
        let data = Buffer.alloc(len+5);
        buff.copy(data, 0, 0, len+5);
        cmd1 = data[2]
        let cmd2 = data[3];
        let args = Buffer.alloc(len);
        data.copy(args, 0, 4, len+4);
        if (verifyChecksum(data)) runVTRCommand(cmd1, cmd2, [...args]);
        else console.error('checksum error');
    }
    clear(curr);
}

function runVTRCommand(cmd1, cmd2, arguments) {
    switch (cmd1) {
        case 0x1a:
            switch (cmd2) {
                case 0xc0:
                    send([0x30, 0x0c, 0x1b, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
                break;
            }
            break;
    }
}

function runCommand(cmd1, cmd2, arguments) {
    //console.log(`Cmd1: ${cmd1.toString(16)}, Cmd2: ${cmd2.toString(16)}, Args: ${arguments}`);
    switch (cmd1) {
        case 0x2:
            switch (cmd2) {
                case 0x0: //play
                    console.log('stop');
                    callVmix('ReplayPause');
                    break;
                case 0x1: //play
                    console.log('play');
                    callVmix('ReplaySetSpeed', {
                        Value: 1
                    })
                    callVmix('ReplayPlay');
                    break;
                case 0x2:
                    console.log('rec');
                    break;
                case 0x10:
                    console.log('ffwd');
                    break;
                case 0x11:
                    console.log('jog fwd', decodeSpeed(arguments[0]));
                    callVmix('ReplayPause');
                    callVmix('ReplayJumpFrames', {
                        Value: Math.round(decodeSpeed(arguments[0])*speedFactor)
                    });
                    break;
                case 0x12:
                    console.log('t-bar fwd', decodeSpeed(arguments[0]));
                    callVmix('ReplayPlay');
                    callVmix('ReplaySetSpeed', {
                        Value: decodeSpeed(arguments[0])
                    })
                    break;
                case 0x13:
                    console.log('shuttle fwd', decodeSpeed(arguments[0]));
                    callVmix('ReplayJumpToNow');
                    break;
                case 0x20:
                    console.log('rwd');
                    break;
                case 0x21:
                    console.log('jog rev', decodeSpeed(arguments[0]));
                    callVmix('ReplayJumpFrames', {
                        Value: 0-Math.round(decodeSpeed(arguments[0])*speedFactor)
                    });
                    break;
                case 0x22:
                    console.log('t-bar rev', decodeSpeed(arguments[0]));
                    break;
                case 0x23:
                    console.log('shuttle rev', decodeSpeed(arguments[0]));
                    break;
                default:
                    console.log(cmd1.toString(16), cmd2.toString(16), arguments);
            } 
            send([0x10, 0x01])
            break
        case 0x6: //Sense Request
            switch (cmd2) {
                case 0x20: //Status Sense
                    replyStatus(arguments);
                    break
            }
            break;
    }
}

function replyStatus(arguments) {
    let register = (arguments[0] & 0xf0) >> 4;
    let length = arguments[0] & 0xf;
    let answer = [];
    if (length == 1) answer = [0x71, 0x20, 0x00, 0x91];
    if (length == 6) answer = [0x76, 0x20, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x36]
    port.write(answer)
}

function send(data) {
    port.write(data);
    port.write([calculateChecksum(data)])
}

function clear(length) {
    buff.copy(buff, 0, length);
    curr -= length;
}

function callVmix(action, arguments) {
    let query = new URLSearchParams({
        ...arguments
    }).toString();
    console.log('calling', action, query)
    client.write(`FUNCTION ${action} ${query}\r\n`)
}

function calculateChecksum(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i];
    }
    return sum & 0xff;
}

function decodeSpeed(speed) {
    return Math.round(Math.pow(10, (speed/32)-2)*100)/100
}

function verifyChecksum(buffer) {
    let buf = Buffer.alloc(buffer.length-1);
    buffer.copy(buf, 0, 0, buffer.length-1);
    if (buffer[buffer.length-1] == calculateChecksum(buf)) return true;
    return false;
}