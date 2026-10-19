/* Haven Protocol: reminder taps. Pulled into the generated Workbox service worker
 * with importScripts (see `workbox.importScripts` in vite.config.ts). Plain
 * script, no modules: it runs in the service worker scope. */

/** Hash route each reminder opens; the tag is `haven-<kind>` or `haven-timer:<id>`. */
var HAVEN_REMINDER_ROUTES = { board: '#/quests', wave: '#/', timer: '#/quests' };

/** Absolute URL the app should show for a tapped reminder. `scope` ends with a slash. */
function havenReminderUrl(scope, tag) {
  var kind = String(tag || '').replace(/^haven-/, '').split(':')[0];
  return scope + (HAVEN_REMINDER_ROUTES[kind] || '#/');
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var scope = self.registration.scope;
  var url = havenReminderUrl(scope, event.notification.tag);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      var mine = windows.filter(function (w) {
        return String(w.url).indexOf(scope) === 0;
      })[0];
      if (!mine) return self.clients.openWindow(url);
      return mine.focus().then(function (focused) {
        // Same document, new fragment: no reload. Some browsers refuse; focusing is enough then.
        return (focused || mine).navigate(url);
      }).catch(function () {});
    }),
  );
});
