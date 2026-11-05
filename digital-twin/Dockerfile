FROM nodered/node-red:latest

# Keep the working directory used by the official Node-RED image. Its
# entrypoint runs npm start from here; changing it to /data makes npm read
# the application package.json instead of Node-RED's package.json.
WORKDIR /usr/src/node-red

# Install the MQTT client used by the custom Node-RED nodes in /data, where
# Node-RED already looks for user-installed modules.
COPY package.json /data/package.json
RUN npm install --prefix /data --omit=dev --no-audit --no-fund

# Keep the runtime configuration and flows in the image so a free Render
# instance can be recreated safely after a restart or spin-down.
COPY settings.js /data/settings.js
COPY flows.json /data/flows.json
COPY nodes /data/nodes

ENV FLOWS=flows.json
EXPOSE 1880
