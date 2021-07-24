const io = require("socket.io-client");
const socket = io("ws://localhost:3000");
var constants = require("./constants");
const config = require("./config");
const appInsights = require("applicationinsights");
const ConnectMessage = require("./ConnectMessage");
const MessageReceived = require("./MessageReceived");

var myargs = process.argv.slice(2); // channelName
var channelName = myargs[0];
appInsights.setup(config.appInsightKey).start();
var client = appInsights.defaultClient;

var messageBatchReceived = 0;
var totalMessageReceived = 0;
var lostMessages = 0;
var sequence = -1;
var mySet = new Set();
let myMap = new Map();

socket.on("connect", () => {
  var connMessage = new ConnectMessage(socket.id, channelName);
  socket.emit("connMessage", JSON.stringify(connMessage));
  console.log("client connected");
  // send the telemetry
  client.trackMetric({ name: "socketConnected", value: 1.0 });
});

// handle the event sent with socket.send()
socket.on("ops", (data) => {
  // console.log("message via message event" + data);
  var message = JSON.parse(data);
  console.log("received: " + message.content);
  processMessage(message);
  totalMessageReceived++;
  messageBatchReceived++;
  // process the message with the logic
});

socket.on("disconnect", (reason) => {
  console.log("disconnect client");
  client.trackMetric({ name: "socketDisconnected", value: 1.0 });
});

function processMessage(messageObject) {
  if (isNumberInSequence(messageObject.content)) {
    var currentTime = Date.now();
    if (
      currentTime - messageObject.timestamp >
      constants.MESSAGE_EXPIRY_INTERVAL
    ) {
      lostMessages++;
    }
    sequence++;
  } else {
    if (messageObject.content < sequence) {
      // it is present in set
      var storedMessage = myMap.get(messageObject.content);
      var currentTime = Date.now();
      if (
        currentTime - messageObject.timestamp >
        constants.MESSAGE_EXPIRY_INTERVAL
      ) {
        lostMessages++;
      }
      mySet.delete(storedMessage);
      myMap.delete(storedMessage.content);
    } else {
      for (var i = sequence + 1; i < messageObject.content; i++) {
        // add all missing elements in set and map
        var receivedMessage = new MessageReceived(i, messageObject.timestamp);
        mySet.add(receivedMessage);
        myMap.set(receivedMessage.content, receivedMessage);
      }
      sequence = messageObject.content; // update sequence
    }
  }
}

function isNumberInSequence(content) {
  if (content - sequence == 1) {
    return true;
  }
  return false;
}

setInterval(sendMetric, constants.METRIC_SENT_INTERVAL);

function sendMetric() {
  var currentTime = Date.now();
  processStoredElements(currentTime);
  var propertySet = {
    "totalMessageReceived": totalMessageReceived,
    "lostMessages": lostMessages,
    "messageBatchReceived": messageBatchReceived,
    "channelId": channelName
  };
  var metrics = {
    "lostMessages": lostMessages,
    "MessageBatchReceived": messageBatchReceived
  };
  // console.log("properties: " + JSON.stringify(propertySet));
  // console.log("metrics: " + JSON.stringify(metrics));
  client.trackEvent({
    name: "subEvents",
    properties: propertySet,
    measurements: metrics
  });
  resetValues();
}

function processStoredElements(currentTime) {
  mySet.forEach((item) => {
    if (currentTime - item.timestamp > constants.MESSAGE_EXPIRY_INTERVAL) {
      lostMessages++;
      var messageSaved = myMap.get(item.content);
      mySet.delete(messageSaved);
      myMap.delete(item.content);
    }
  });
}

function resetValues() {
  lostMessages = 0;
  messageBatchReceived = 0;
}
