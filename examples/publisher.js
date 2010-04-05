#!/usr/bin/env node

// This script plays the role of publisher.

var sys = require("sys");
var redis = require("../redisclient");

//redis.debugMode = true;
var client = redis.createClient();

// Publish a message once a second to a random channel.

client.stream.addListener("connect", function () {
    setInterval(function () {
        var channelName = "channel-" + Math.random().toString().substr(2);
        var payload = "The time is " + (new Date());
        client.publish(channelName, payload, function (err, reply) {
            sys.puts("Published message to " + (reply === 0 ? "no one" : (reply + " subscriber(s).")));
        });
    }, 1000); 
});
