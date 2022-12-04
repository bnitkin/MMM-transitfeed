/* MagicMirror²
 * Module: HelloWorld
 *
 * By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 */
function get_json(url){
    var request = new XMLHttpRequest(); // a new request
    request.open("GET", url, false);
    request.send(null);
    return request.responseText;
}

Module.register("MMM-septa", {
    // Default module config.
    defaults: {
        name: "SEPTA: City Hall",
        lat: 39.95249015804094,
        lon: -75.16358528523044,

        radius: 0.1,
        // Allowed: bus, train, trolley
        type: ["bus", "trolley", "train"],
    },

    getHeader: function () {
        return this.config.name;
    },

    getDom: function () {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = this.config.name;
        return wrapper;
    },

    start: function () {
        // Ask the node helper to find matching stations
        this.sendSocketNotification("MONITOR_NEARBY_DEPARTURES", this.config);
    },

    socketNotificationReceived: function(notification, payload) {
        Log.log(this.name + " received a socket notification: " + notification + " - Payload: " + JSON.stringify(payload));
    },
});
