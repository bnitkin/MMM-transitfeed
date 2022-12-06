/* Magic Mirror
 * Module: MMM-gtfs
 * A generic transit parser to display upcoming departures
 * for a selected set of lines
 *
 * By Ben Nitkin
 * MIT Licensed.
 */

// to download GTFS file
const Log = require("logger");
const fetch = require("fetch");
const NodeHelper = require("node_helper");

// GTFS stuff
const gtfs = require('gtfs');

module.exports = NodeHelper.create({
   // Subclassed functions
   start: function () {
      console.log(this.name + ' helper method started...'); /*eslint-disable-line*/
   },

   socketNotificationReceived: async function (notification, payload) {
      Log.log("MMM-gtfs: helper recieved", notification, payload);
      if (notification === 'GTFS_STARTUP') this.startup(payload);
      if (notification === "GTFS_QUERY2")  this.query(payload.gtfs_config, payload.query);
   },

   startup: async function(gtfs_config) {
      // Import the data. Send a notification when ready.
      Log.log("MMM-gtfs: Importing with " + gtfs_config);
      await gtfs.import(gtfs_config);
      // Send a ready message now that we're loaded.
      this.sendSocketNotification("GTFS_READY", null);
      Log.log("MMM-gtfs: Done importing!");
   },

   query: async function(gtfs_config, query) {
      const db = await gtfs.openDb(gtfs_config);
      //const query = {route_name: "Chestnut Hill West", stop_name: "Tulpehocken", direction: 0};

      let results = [];
      // Find stops matching the query string
      const allStops = await gtfs.getStops({}, ['stop_name', 'stop_id']);
      for (stop of allStops) {
         if (stop.stop_name.includes(query.stop_name)) {

            // Find the routes serving this stop.
            const routes = await gtfs.getRoutes({stop_id: stop.stop_id}, ['route_long_name', 'route_id']);
            for (route of routes) {
               // If a user provided a route name, filter on it.
               if (query.route_name === undefined || route.route_long_name.includes(query.route_name)) {

                  // Find all trips for the route
                  //const trips = await gtfs.getTrips({route_id: route.route_id}, ['trip_id', 'direction_id', 'trip_headsign', 'service_id']);
                  const trips = await gtfs.getTrips({route_id: route.route_id});
                  for (trip of trips) {
                     if (query.direction === undefined || query.direction == trip.direction_id) {
                        // Now we have the stop and all the trips.
                        const stopDays = await gtfs.getCalendars({service_id: trip.service_id});
                        const stoptime = await gtfs.getStoptimes({trip_id: trip.trip_id, stop_id: stop.stop_id}, ['id', 'departure_time']);

                        // If there's no stoptime, the train skips this stop.
                        if (stoptime.length == 0) continue;

                        const stopDatetimes = makeStopDatetimes(stopDays[0], stoptime[0].departure_time);
                        for (datetime of stopDatetimes) {
                           results.push({
                              // IDs for tracing
                              time_id: stoptime[0].id,
                              stop_id: stop.stop_id,
                              route_id: route.route_id,
                              trip_id: trip.trip_id,

                              route_name: route.route_long_name,
                              trip_terminus: trip.trip_headsign,
                              stop_name: stop.stop_name,
                              stop_time: datetime,

                              delay: 0,
                           });
                        }
                     }
                  }
               }
            }
         }
      }
      // Sort, then publish.
      results = results.sort((one, two) =>
            one.route_name.localeCompare(two.route_name, "en-u-kn-true") ||
            one.stop_name.localeCompare(two.stop_name, "en-u-kn-true") ||
            one.trip_terminus.localeCompare(two.trip_terminus, "en-u-kn-true") ||
            one.stop_time - two.stop_time);

      // Now we have everything we need.
      Log.log("Sending " + results.length + " starting with");
      Log.log(results[0]);
      this.sendSocketNotification("GTFS_QUERY_RESULTS", results);
   },
})

function makeStopDatetimes(stop_days, stop_time) {
   // This accepts a GTFS calendar and a stop time
   // and creates Date objects for the next few days of arrivals.
   // Start/end dates are ignored for calendars, as are holidays.
   //
   // Format reference
   //stop_time: '09:43:00'
   //stop_days: {
   //   service_id: 'M3',
   //   monday: 0,
   //   tuesday: 0,
   //   wednesday: 0,
   //   thursday: 0,
   //   friday: 0,
   //   saturday: 0,
   //   sunday: 1,
   //   start_date: 20220821,
   //   end_date: 20230304
   // },

   const departures = [];

   // Create a Date with today's date and stop_time for the time.
   const dateCandidate = new Date();
   const time = new Date('2000-01-01T' + stop_time)
   dateCandidate.setHours(time.getHours());
   dateCandidate.setMinutes(time.getMinutes());
   dateCandidate.setSeconds(time.getSeconds());

   const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
   for (let i = 0; i < 2; i++) {
      const dayofweek = days[dateCandidate.getDay()];
      if (stop_days[dayofweek] == 1)
         departures.push(new Date(dateCandidate));

      dateCandidate.setDate(dateCandidate.getDate() + 1)
   }
   return departures;
}
