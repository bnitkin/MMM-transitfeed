/* Magic Mirror
 * Module: MMM-gtfs
 * A generic transit parser to display upcoming departures
 * for a selected set of lines
 *
 * By Ben Nitkin
 * MIT Licensed.
 */

Module.register("MMM-gtfs", {
   // Default module config.
   defaults: {
      // GTFS data to load - this is the config object described in:
      // https://www.npmjs.com/package/gtfs/v/2.4.4#configuration
      //
      // The default below shows how to load multiple GTFS files,
      // but custom headers & auth-tokens are supported.
      gtfs_config: {
         agencies: [
            // These are SEPTA bus & rail routes. Go to transitfeeds.com
            // or your transit agency's site to find local GTFS data.
            // Excluding shapes makes loading faster.
            //                  "realtimeUrls": [
//        "https://opendata.somewhere.com/gtfs-rt/VehicleUpdates.pb",
//        "https://opendata.somewhere.com/gtfs-rt/TripUpdates.pb"
//      ],
            {
               "path": "/home/ben/Downloads/train.zip",
//             "url": "https://transitfeeds.com/p/septa/262/latest/download",
               "realTimeUrls": [
                  "https://www3.septa.org/api/pbtojson/Train/Trip/index.php",
                  "https://www3.septa.org/api/pbtojson/Train/Vehicle/index.php",
               ],
               exclude: ['shapes']
            },
          {
             "path": "/home/ben/Downloads/bus.zip",
//             "url": "https://transitfeeds.com/p/septa/263/latest/download",
             "realTimeUrls": [
                "https://www3.septa.org/api/pbtojson/Bus/Trip/index.php",
                "https://www3.septa.org/api/pbtojson/Bus/Vehicle/index.php",
             ],
             exclude: ['shapes']},
         ],
      },

      // Route + station pairs to monitor for departures
      queries: [
         {route_name: "Chestnut Hill West", stop_name: "Tulpehocken", direction: 0},
         {route_name: "Chestnut Hill East", stop_name: "Germantown", direction: 1},
         {route_name: "53", stop_name: "Tulpehocken", direction: 0},
         {route_name: "65", stop_name: "Walnut Ln & Wayne", direction: 0},
      ],
      departuresPerRoute: 3,
      // If true, show minutes till arrival. If false, show arrival time in HH:MM
      showTimeFromNow: true,
      // Display the station name above the routes appearing at that station
      showStationNames: true,
      // If true, separate multi-terminus routes into one line per terminus.
      showAllTerminus: false,
   },

   start: function () {
      // Set up initial DOM wrapper
      this.wrapper = document.createElement("table");
      this.trips = [];

      // Send the config dictionary to the helper.
      this.sendSocketNotification("GTFS_STARTUP", this.config.gtfs_config);
   },

   getDom: function () {
      // Fake trip for comparison purposes
      let lastTrip = {trip_terminus: '', route_name: '', stop_name: ''};
      let row;
      let departureCount = 0;

      // Clear contents
      this.wrapper.innerHTML = "";

      for (trip of this.trips) {
         if (this.config.showStationNames && trip.stop_name != lastTrip.stop_name) {
            row = this.wrapper.insertRow();
            let stop = row.insertCell();
            stop.innerHTML = trip.stop_name;
            stop.colSpan = 5;
            stop.className = "align-left";
         }
         if (trip.route_name != lastTrip.route_name
          || trip.direction != lastTrip.direction
          || (this.config.showAllTerminus && (trip.trip_terminus != lastTrip.trip_terminus))) {
            departureCount = 0;

            row = this.wrapper.insertRow();
            let route = row.insertCell();
            route.innerHTML = trip.route_id;
            route.className = "align-left bright";

            let terminus = row.insertCell();
            terminus.innerHTML = trip.trip_terminus;
            terminus.className = "align-left";
            terminus.className += " xsmall";
         }

         lastTrip = trip;

         if (departureCount == this.config.departuresPerRoute) continue;
         departureCount += 1;

         let departure_time = row.insertCell();
         Log.log(trip);
         let minutes = ((trip.stop_time - Date.now()) / 1000 / 60).toFixed();
         if (this.config.showTimeFromNow)
            departure_time.innerHTML = minutes;
         else
            departure_time.innerHTML = trip.stop_time.toTimeString().slice(0,5);

         if (minutes <= 5) {
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

      return this.wrapper;
   },

   socketNotificationReceived: async function(notification, payload) {
      // Once the GTFS data is all imported, resolve our queries.
      if (notification == "GTFS_READY") {
         // Set up the helper to send us data.
         Log.log("Querying");
         Log.log(this.config.queries);
         for (query of this.config.queries) { 
            this.sendSocketNotification("GTFS_QUERY_SEARCH",
               {'gtfs_config': this.config.gtfs_config, 'query': query});
         }
      }
      if (notification == "GTFS_QUERY_RESULTS") {
         Log.log("MMM-gtfs got a query response");
         // Times don't survive the JSON serialization - need to recover them.
         for (trip of payload) trip.stop_time = new Date(trip.stop_time);
         this.trips = payload;
         Log.log(this.trips);
         this.updateDepartures();
      }
   },

   updateDepartures: function() {
      // TODO: Update departures with realtime data.
      this.trips = this.trips.filter(trip => trip.stop_time > Date.now())
      Log.log(this.trips.length + " trips in queue");
      this.updateDom();
   },
});
