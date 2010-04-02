#!/usr/bin/env node

// This script plays the role of listener/subscriber/consumer
// to **all** channels/classes.

var sys = require("sys");
var redis = require("../redisclient");

//redis.debugMode = true;
var client = redis.createClient();
    
client.stream.addListener("connect", function () {
    sys.puts("waiting for messages...");
    client.subscribeTo("*", function (channel, message) {
        sys.puts("[" + channel + "]: " + message);
    });
});
