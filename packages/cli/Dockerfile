FROM node:23.11.0-alpine3.21

WORKDIR /app
VOLUME /project

RUN npm install -g @valerypopoff/rivet2-cli@2.0.0

COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
