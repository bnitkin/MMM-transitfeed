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
    Log.log("MMM-septa fetching ", url);
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
        Log.log("MMM-septa helper recieved", notification);
        if (notification === 'MONITOR_NEARBY_DEPARTURES') {
            this.watchNewStations(payload);
            // Special update for faster loading on refresh.
            this.updatePushETAs();
        }
    },

    // Non-inherited stuff
    updatePushETAs: function() {
        Log.log("MMM-septa is updating ETAs for " + this.stations.length + " stations");
        for (let station of this.stations) {
            // Update ETAs for each line, and publish.
            for (let departure of station.departures) {
                // This could be fancier by hitting the SEPTA real-time APIs.
                departure.minutes = ((departure.date - Date.now()) / 1000 / 60).toFixed();
                //departure.minutes = (departure.minutes / 60).toFixed() + ":" + departure.minutes % 60
            }
            this.sendSocketNotification("STATION_DEPARTURES", station);

            // Remove departures that've departed.
            if ((station.departures.length > 0) && ((station.departures[0].date - Date.now()) < 0)) {
                station.departures.shift();
            }
        }
    },

    watchNewStations: async function (config) {
        Log.log("MMM-septa is searcing for stations using:", config);

        for (const vehicle_type of config.type) {
            stop_name = {'bus': 'bus_stops',
                'train': 'rail_stations',
                'trolley': 'trolley_stops'}[vehicle_type];
            if (stop_name === undefined) {
                Log.warn("MMM-septa: Unrecognized vehicle type " + vehicle_type);
                continue;
            }

            let url = "https://www3.septa.org/api/locations/get_locations.php"
                + "?lon="    + config.lon
                + "&lat="    + config.lat
                + "&radius=" + config.radius
                + "&type="   + stop_name;
            json = await getJSON(url);
            Log.log("MMM-septa discovered " + json.length + " " + vehicle_type + " stations");
            for (const station of json) {
                // Don't duplicate stations. This protects against multiple clients or
                // page reloads.
                if (this.stations.some(function(element, index, array) {
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
                    // This tracks which widget enrolled a station
                    'widget-id': config.identifier,
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
        // Empty arrivals list to prepare for refresh
        station.departures = [];
        if (station.type == "bus_stops" || station.type == "trolley_stops") {
            // Get 30 results for buses. That covers an hour of traffic at all but the busiest stops.
            let url = "https://www3.septa.org/api/BusSchedules/index.php?results=30&stop_id=" + station.id;
            json = await getJSON(url);
            for (const route of Object.values(json)) {
                for (const arrival of route) {
                    station.departures.push({
                        'trip_id': arrival.trip_id,
                        'route': arrival.Route,
                        'date': new Date(arrival.DateCalender),
                        'minutes': 0,
                        'terminus': arrival.DirectionDesc,
                    });
                }
            }
        }
        if (station.type == "rail_stations") {
            // Poll 10 results for trains; SEPTA returns 10 in each direction.
            let url = "https://www3.septa.org/api/Arrivals/index.php?results=10&station=" + station.name;
            json = await getJSON(url);
            // Traversing through the weird time/date header and list of directions:
            // {
            //   "Tulpehocken Departures: December 4, 2022, 9:13 am": [
            //     {
            //       "Northbound": [
            //         {
            //           "direction": "N",
            //           ...
            for (const weirdHeader of Object.values(json)) {
                for (const weirdList of weirdHeader) {
                    for (const direction of Object.values(weirdList)) {
                        for (const arrival of direction) {
                            station.departures.push({
                                'trip_id': arrival.train_id,
                                'route': arrival.line,
                                'date': new Date(arrival.depart_time),
                                'minutes': 0,
                                'terminus': arrival.destination,
                            });
                        }
                    }
                }
            }
        }
        // Sort by route, then departure time.
        // That lets the renderer make some easy assumptions.
        station.departures.sort((one, two) =>
            one.route.localeCompare(two.route) ||
            one.date - two.date);
        Log.log("MMM-septa: found " + station.departures.length + " departures from " + station.name);
    },
})
