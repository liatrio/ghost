FROM debian:bullseye
LABEL maintainer="Andrei Titerlea (andrei.titerlea@liatrio.com)"

ARG NODE_VERSION="18.14.1"

ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR=/usr/local/nvm
ENV PATH=$NVM_DIR:$PATH

RUN mkdir -p $NVM_DIR
RUN apt-get update && apt-get install -y \
      wget                               \
    && rm -rf /var/lib/apt/lists/*

COPY src /app
WORKDIR /app

RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash \
    && . $NVM_DIR/nvm.sh                                                             \
    && nvm install ${NODE_VERSION}                                                   \
    && nvm use ${NODE_VERSION}                                                       \
    && npm install -g                                                                \
      npm@9.5.0                                                                      \
      yarn@v1.22.19                                                                  \
    && yarn install
