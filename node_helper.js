/* Magic Mirror
 * Module: MMM-septa
 *
 * By Ben Nitkin
 * MIT Licensed.
 */
const Log = require("logger");
const fetch = require("fetch");
const NodeHelper = require("node_helper");

async function getJSON(url) {
    Log.log("Fetching ", url);
    const response = await fetch(url, {headers: {"User-Agent": "Mozilla/5.0 (Node.js) MagicMirror/" + global.version}});
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const json = await response.json();
    return json;
}

module.exports = NodeHelper.create({
    // Subclassed functions
    start: function () {
        console.log(this.name + ' helper method started...'); /*eslint-disable-line*/

        // List of stations to monitor for departures
        this.stations = [];

        // Update arrivals timetables 20s after start, then hourly.
        // The arrow's a goofy hack to keep the this. context.
        setInterval(() => this.updateArrivalsFromSEPTA(), 1000*60*60);
        setTimeout(()  => this.updateArrivalsFromSEPTA(), 1000*20);

        // Update arrival estimates every 30s.
        setInterval(() => this.updatePushETAs(), 1000*30);
    },

    socketNotificationReceived: function (notification, payload) {
        Log.log("SEPTA monitor recieved", notification);
        if (notification === 'MONITOR_NEARBY_DEPARTURES') {
            this.watchNewStations(payload);
        }
    },

    // Non-inherited stuff
    updatePushETAs: function() {
        for (let station of this.stations) {
            // Update ETAs for each line, and publish.
            for (let departure of station.departures) {
                // This could be fancier by hitting the SEPTA real-time APIs.
                departure.minutes = ((departure.date - Date.now()) / 1000 / 60).toFixed;
            }
            this.sendSocketNotification("STATION_DEPARTURES", station);

            // Remove departures that've departed.
            if (station.departure[0].minutes < 0) {
                station.departures.shift()
            }
        }
    },

    watchNewStations: async function (config) {
        Log.log("Searcing for stations near:", config);

        for (const vehicle_type of config.type) {
            stop_name = {'bus': 'bus_stops',
                'train': 'rail_stations',
                'trolley': 'trolley_stops'}[vehicle_type];
            if (stop_name === undefined) {
                Log.warn("Vehicle type of " + vehicle_type + " is not recognized.");
                continue;
            }

            let url = "https://www3.septa.org/api/locations/get_locations.php"
                + "?lon="    + config.lon
                + "&lat="    + config.lat
                + "&radius=" + config.radius
                + "&type="   + stop_name;
            json = await getJSON(url);
            Log.log("Found " + json.length + " " + vehicle_type + " stations");
            for (const station of json) {
                // Check if the station's already present.
                if (this.stations.some(function(element, index, array) {
                    Log.log(element.id + " " + station.location_id);
                    return element.id == station.location_id;
                })) continue;

                // Insert new stations into existing list.
                this.stations.push({
                    'name': station.location_name,
                    'id':   station.location_id,
                    'type': station.location_type, // bus_stops, etc
                    'lat':  station.location_lat,
                    'lon':  station.location_lon,
                    'departures': [],
                    // This lets multiple widgets figure out which stations are for them.
                    'widget-name': config.name,
                });
            }
        }
    },

    updateArrivalsFromSEPTA: function () {
        for (const station of this.stations) {
            this.updateStationArrivalsFromSEPTA(station);
        }
    },

    updateStationArrivalsFromSEPTA: async function (station) {
        Log.warn("Checking timetable for:", station);
        // Empty arrivals list to prepare for refresh
        station.departures = [];
        if (station.type == "bus_stops" || station.type == "trolley_stops") {
            let url = "https://www3.septa.org/api/BusSchedules/index.php?stop_id=" + station.id;
            json = await getJSON(url);
            for (const route of Object.values(json)) {
                for (const arrival of route) {
                    station.departures.push({
                        'trip_id': arrival.trip_id,
                        'route': arrival.Route,
                        'date': new Date(arrival.DateCalender),
                        'minutes': 0,
                        'terminus': arrival.DirectionDesc,
                        'route': arrival.route,
                    });
                }
            }
        }
        if (station.type == "rail_station") {
            Log.error("Rail isn't supported yet!");
        }
        Log.log("Found " + station.departures.length + " departures")
    },
})
