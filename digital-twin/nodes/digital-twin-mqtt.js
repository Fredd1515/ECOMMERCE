const mqtt = require('mqtt');
let RED;

function env(name, fallback) {
    return process.env[name] || fallback;
}

function makeClient(node) {
    const url = process.env.MQTT_URL;
    if (!url) {
        node.status({ fill: 'red', shape: 'ring', text: 'MQTT_URL no configurada' });
        node.error('Configura MQTT_URL en las variables de entorno.');
        return null;
    }

    const options = {
        clientId: `${env('MQTT_CLIENT_PREFIX', 'digital-twin-node-red')}-${Math.random().toString(16).slice(2)}`,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        keepalive: 60,
        clean: true
    };

    if (url.startsWith('mqtts://') || url.startsWith('wss://')) {
        options.rejectUnauthorized = process.env.MQTT_TLS_INSECURE !== 'true';
    }

    const client = mqtt.connect(url, options);

    client.on('connect', () => {
        node.status({ fill: 'green', shape: 'dot', text: 'MQTT conectado' });
    });
    client.on('reconnect', () => {
        node.status({ fill: 'yellow', shape: 'ring', text: 'MQTT reconectando' });
    });
    client.on('close', () => {
        node.status({ fill: 'yellow', shape: 'ring', text: 'MQTT desconectado' });
    });
    client.on('error', (error) => {
        node.warn(`MQTT: ${error.message}`);
    });

    return client;
}

function MqttIn(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const topic = config.topic || env('MQTT_STATE_TOPIC', `${env('MQTT_BASE_TOPIC', 'digital-twin/openplc')}/state`);
    const qos = Number(config.qos || 1);
    const client = makeClient(node);

    if (!client) return;

    client.on('connect', () => {
        client.subscribe(topic, { qos }, (error) => {
            if (error) node.error(`No se pudo suscribir a ${topic}: ${error.message}`);
        });
    });

    client.on('message', (receivedTopic, buffer) => {
        const raw = buffer.toString();
        let payload = raw;
        try {
            payload = JSON.parse(raw);
        } catch (_) {
            // Keep non-JSON payloads as strings.
        }
        node.send({ topic: receivedTopic, payload, raw });
    });

    node.on('close', (done) => client.end(true, done));
}

function MqttOut(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const topic = config.topic || env('MQTT_COMMAND_TOPIC', `${env('MQTT_BASE_TOPIC', 'digital-twin/openplc')}/command`);
    const qos = Number(config.qos || 1);
    const retain = config.retain === true || config.retain === 'true';
    const client = makeClient(node);

    if (!client) return;

    node.on('input', (msg, send, done) => {
        const outputTopic = msg.topic || topic;
        const payload = Buffer.isBuffer(msg.payload)
            ? msg.payload
            : typeof msg.payload === 'string'
                ? msg.payload
                : JSON.stringify(msg.payload);

        client.publish(outputTopic, payload, { qos, retain }, (error) => {
            if (error) {
                node.error(`No se pudo publicar en ${outputTopic}: ${error.message}`, msg);
                if (done) done(error);
                return;
            }
            if (done) done();
        });
    });

    node.on('close', (done) => client.end(true, done));
}

module.exports = function (red) {
    RED = red;
    RED.nodes.registerType('digital-twin-mqtt-in', MqttIn);
    RED.nodes.registerType('digital-twin-mqtt-out', MqttOut);
};

