/* MagicMirror²
 * Module: HelloWorld
 *
 * By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 */


// Todo: Identify the closest station for each route
// Identify each route in the catchment
// Or just monitor a list of station-route pairs. Offload the hard stuff to the user.
function get_json(url){
    var request = new XMLHttpRequest(); // a new request
    request.open("GET", url, false);
    request.send(null);
    return request.responseText;
}

Module.register("MMM-septa", {
    // Default module config.
    defaults: {
        name: "SEPTA Departures: City Hall",
        lat: 39.95249015804094,
        lon: -75.16358528523044,

        radius: 0.05,
        // Allowed: bus, train, trolley
        type: ["bus", "trolley", "train"],
        showStationName: true,
        departuresPerRoute: 3,
    },

//    getHeader: function () {
//        if (this.config.showHeader) return this.config.name;
//        return '';
//    },

    getDom: function () {
        return this.wrapper;
    },

    start: function () {
        // Ask the node helper to find matching stations
        this.config.identifier = this.identifier;
        this.sendSocketNotification("MONITOR_NEARBY_DEPARTURES", this.config);

        // Set up initial DOM wrapper
        this.wrapper = document.createElement("div");
    },

    socketNotificationReceived: function(notification, payload) {
        if (payload['widget-id'] != this.identifier) return;

        Log.log(this.name + " received a socket notification: " + notification + " - Payload: " + JSON.stringify(payload));
        let station = this.wrapper.querySelector("#station-" + payload['id']);

        if (station === null) {
            station = document.createElement("div");
            station.id = "station-" + payload['id'];
            this.wrapper.appendChild(station);

            if (this.config.showStationName) {
                stationName = document.createElement("div");
                stationName.innerHTML = payload['name'];
                stationName.className = "align-left title bright";
                station.appendChild(stationName);
            }
            let departures = document.createElement("table");
            departures.id = "departures-" + payload['id'];
            station.appendChild(departures);
        }

        let departures = this.wrapper.querySelector("#departures-" + payload['id']);
        departures.innerHTML = "";

        // One row per route.
        lastRoute = null;
        let row;
        let departureCount = 0;
        for (let departure of payload.departures) {
            if (departure.route != lastRoute) {
                lastRoute = departure.route;
                departureCount = 0;

                row = departures.insertRow();
                let route = row.insertCell();
                route.innerHTML = departure.route;
                route.className = "align-left bright";

                let terminus = row.insertCell();
                terminus.innerHTML = departure.terminus;
                terminus.className = "align-left";
                terminus.className += " xsmall";
            }

            if (departureCount == this.config.departuresPerRoute) continue;
            departureCount += 1;
            let departure_time = row.insertCell();
            departure_time.innerHTML = departure.minutes;
            if (departure.minutes <= 5) {
                departure_time.style.color = "#f66";
            }
            if (departureCount == 1) {
                departure_time.className = "bright";
                departure_time.style.width = "35px";
            } else {
                departure_time.className = "dim xsmall";
                departure_time.style.width = "30px";
            }
        }

        this.updateDom();
    },
});
