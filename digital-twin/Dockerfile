FROM nodered/node-red:latest

# Install the MQTT client used by the custom Node-RED nodes.
WORKDIR /data
COPY package.json /data/package.json
RUN npm install --omit=dev --no-audit --no-fund

# Keep the runtime configuration and flows in the image so a free Render
# instance can be recreated safely after a restart or spin-down.
COPY settings.js /data/settings.js
COPY flows.json /data/flows.json
COPY nodes /data/nodes

ENV FLOWS=flows.json
EXPOSE 1880

