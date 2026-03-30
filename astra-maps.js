// ═══════════════════════════════════════════
// ASTRA — GOOGLE MAPS / VECTOR ROUTE
// ═══════════════════════════════════════════
(function() {
'use strict';

const A = window.Astra;

let gmapsLoaded = false, gMap = null, gMarkers = [], gDirectionsRenderer = null, gMapJobs = [];
const MAP_STATUS_COLORS = {
  'Not Started': '#FF6B00', 'In Progress': '#FBBF24',
  'Needs Callback': '#EF4444', 'Waiting on Materials': '#3B82F6'
};

function loadGmaps() {
  return new Promise((resolve, reject) => {
    if (gmapsLoaded && window.google && window.google.maps) { resolve(); return; }
    const key = A.getGmapsKey();
    if (!key) { reject('NO API KEY. ADD IN SETTINGS.'); return; }
    const old = document.getElementById('gmaps-script');
    if (old) old.remove();
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&libraries=places';
    s.onload = () => { gmapsLoaded = true; resolve(); };
    s.onerror = () => reject('MAP LOAD FAILED. CHECK API KEY.');
    document.head.appendChild(s);
  });
}

function gmapGeocode(address) {
  return new Promise((resolve, reject) => {
    new google.maps.Geocoder().geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else reject('GEOCODE FAILED: ' + status);
    });
  });
}

function setMapStatus(msg) {
  const el = document.getElementById('map-status');
  if (msg) { el.textContent = msg; el.style.display = ''; }
  else el.style.display = 'none';
}

async function renderMap() {
  const key = A.getGmapsKey();
  if (!key) {
    document.getElementById('map-container').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:#444;font-size:14px;line-height:1.6;text-transform:uppercase;letter-spacing:1px;font-weight:700;">ADD GOOGLE MAPS API KEY IN SETTINGS</div>';
    document.getElementById('map-controls').style.display = 'none';
    return;
  }

  try { setMapStatus('LOADING...'); await loadGmaps(); }
  catch (e) { setMapStatus(e); return; }

  // Vector: today's tickets + manually added
  const today = A.todayStr();
  const jobs = A.loadJobs().filter(j => !j.archived && (j.date === today || j.manually_added_to_vector));

  if (!gMap) {
    gMap = new google.maps.Map(document.getElementById('map-container'), {
      center: { lat: 29.76, lng: -95.37 }, zoom: 11,
      disableDefaultUI: true, zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }
    });
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(pos => {
        gMap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => {}, { timeout: 5000 });
    }
  } else {
    setTimeout(() => google.maps.event.trigger(gMap, 'resize'), 200);
  }

  gMarkers.forEach(m => m.setMap(null));
  gMarkers = []; gMapJobs = [];
  if (gDirectionsRenderer) { gDirectionsRenderer.setMap(null); gDirectionsRenderer = null; }

  if (jobs.length === 0) {
    setMapStatus('NO TICKETS FOR TODAY.');
    document.getElementById('map-controls').style.display = 'none';
    return;
  }

  setMapStatus('GEOCODING ' + jobs.length + ' ADDRESSES...');
  const bounds = new google.maps.LatLngBounds();
  let geocoded = 0;

  const addrs = A.loadAddresses();
  for (const job of jobs) {
    try {
      const addrRec = addrs.find(a => a.address.toLowerCase() === job.address.toLowerCase());
      let coords;
      if (addrRec && addrRec.lat && addrRec.lng) {
        coords = { lat: addrRec.lat, lng: addrRec.lng };
      } else {
        coords = await gmapGeocode(job.address);
        if (addrRec) A.updateAddress(addrRec.id, { lat: coords.lat, lng: coords.lng });
      }
      const color = MAP_STATUS_COLORS[job.status] || '#FF6B00';
      const marker = new google.maps.Marker({
        position: coords, map: gMap, title: job.address,
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 10 }
      });
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:inherit;min-width:200px;padding:10px;background:#1a1a1a;color:#e0e0e0;border-radius:10px;">
          <div style="font-weight:800;font-size:13px;margin-bottom:6px;letter-spacing:0.5px;">${A.esc(job.address)}</div>
          <div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${A.esc((job.types || []).join(', ')).toUpperCase()}</div>
          <div style="margin-bottom:10px;"><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-weight:800;font-size:10px;color:#fff;background:${color};letter-spacing:0.5px;">${A.esc(job.status).toUpperCase()}</span></div>
          <button onclick="goTo('screen-detail','${job.id}')" style="background:#FF6B00;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;width:100%;text-transform:uppercase;letter-spacing:1px;">VIEW TICKET</button>
        </div>`
      });
      marker.addListener('click', () => infoWindow.open(gMap, marker));
      gMarkers.push(marker);
      gMapJobs.push({ job, coords, marker });
      bounds.extend(coords);
      geocoded++;
      setMapStatus('GEOCODED ' + geocoded + '/' + jobs.length);
    } catch (e) { console.warn('Geocode failed:', job.address, e); }
  }

  if (geocoded > 0) {
    gMap.fitBounds(bounds, { top: 60, bottom: 80, left: 40, right: 40 });
    // Prevent over-zoom on single ticket — cap at street level
    const listener = google.maps.event.addListener(gMap, 'idle', () => {
      if (gMap.getZoom() > 15) gMap.setZoom(15);
      google.maps.event.removeListener(listener);
    });
  }
  setMapStatus(null);
  document.getElementById('map-controls').style.display = 'flex';
  document.getElementById('map-optimize-btn').disabled = gMapJobs.length < 2;
  document.getElementById('map-clear-btn').style.display = 'none';
  document.getElementById('map-reroute-btn').style.display = 'none';
}

async function optimizeRoute() {
  if (gMapJobs.length < 2) return;
  const btn = document.getElementById('map-optimize-btn');
  btn.textContent = 'OPTIMIZING...'; btn.disabled = true;

  try {
    const homeBase = A.getHomeBase();
    let origin, destination;

    if (homeBase) {
      try {
        const homeCoords = await gmapGeocode(homeBase);
        origin = homeCoords;
        destination = homeCoords; // round trip
      } catch (e) {
        origin = gMapJobs[0].coords;
        destination = gMapJobs[gMapJobs.length - 1].coords;
      }
    } else {
      origin = gMapJobs[0].coords;
      destination = gMapJobs[gMapJobs.length - 1].coords;
    }

    const waypoints = gMapJobs.map(d => ({ location: d.coords, stopover: true }));

    const result = await new Promise((resolve, reject) => {
      new google.maps.DirectionsService().route({
        origin, destination, waypoints, optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING
      }, (r, s) => s === 'OK' ? resolve(r) : reject('ROUTE FAILED: ' + s));
    });

    if (gDirectionsRenderer) gDirectionsRenderer.setMap(null);
    gDirectionsRenderer = new google.maps.DirectionsRenderer({
      map: gMap, directions: result, suppressMarkers: true,
      polylineOptions: { strokeColor: '#FF6B00', strokeWeight: 4, strokeOpacity: 0.8 }
    });

    const order = result.routes[0].waypoint_order;
    gMarkers.forEach(m => m.setMap(null));
    order.forEach((jobIdx, routePos) => {
      const d = gMapJobs[jobIdx];
      const marker = new google.maps.Marker({
        position: d.coords, map: gMap,
        label: { text: String(routePos + 1), color: '#fff', fontWeight: '800', fontSize: '13px' },
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF6B00', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 16 }
      });
      gMarkers[jobIdx] = marker;
    });

    let totalDist = 0, totalTime = 0;
    result.routes[0].legs.forEach(leg => { totalDist += leg.distance.value; totalTime += leg.duration.value; });
    btn.textContent = Math.round(totalTime / 60) + ' MIN · ' + (totalDist / 1609.34).toFixed(1) + ' MI';
    btn.disabled = false;
    document.getElementById('map-clear-btn').style.display = '';
    document.getElementById('map-reroute-btn').style.display = '';

  } catch (e) {
    console.error('Route failed:', e);
    btn.textContent = 'FAILED — RETRY'; btn.disabled = false;
  }
}

function reroute() {
  if (!('geolocation' in navigator)) { setMapStatus('GPS NOT AVAILABLE.'); return; }
  setMapStatus('GETTING GPS...');
  navigator.geolocation.getCurrentPosition(async pos => {
    const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // Re-optimize from current location, route back to shop
    if (gMapJobs.length < 1) return;
    const btn = document.getElementById('map-optimize-btn');
    btn.textContent = 'REROUTING...'; btn.disabled = true;

    try {
      const homeBase = A.getHomeBase();
      let destination = origin; // fallback if no shop set
      if (homeBase) {
        try { destination = await gmapGeocode(homeBase); }
        catch (e) { console.warn('Home base geocode failed, using current location:', e); }
      }
      const waypoints = gMapJobs.map(d => ({ location: d.coords, stopover: true }));
      const result = await new Promise((resolve, reject) => {
        new google.maps.DirectionsService().route({
          origin, destination, waypoints, optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING
        }, (r, s) => s === 'OK' ? resolve(r) : reject('REROUTE FAILED: ' + s));
      });

      if (gDirectionsRenderer) gDirectionsRenderer.setMap(null);
      gDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: gMap, directions: result, suppressMarkers: true,
        polylineOptions: { strokeColor: '#FF6B00', strokeWeight: 4, strokeOpacity: 0.8 }
      });

      const order = result.routes[0].waypoint_order;
      gMarkers.forEach(m => m.setMap(null));
      order.forEach((jobIdx, routePos) => {
        const d = gMapJobs[jobIdx];
        gMarkers[jobIdx] = new google.maps.Marker({
          position: d.coords, map: gMap,
          label: { text: String(routePos + 1), color: '#fff', fontWeight: '800', fontSize: '13px' },
          icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF6B00', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 16 }
        });
      });

      let totalDist = 0, totalTime = 0;
      result.routes[0].legs.forEach(leg => { totalDist += leg.distance.value; totalTime += leg.duration.value; });
      btn.textContent = Math.round(totalTime / 60) + ' MIN · ' + (totalDist / 1609.34).toFixed(1) + ' MI';
      btn.disabled = false;
      setMapStatus(null);
    } catch (e) {
      btn.textContent = 'FAILED'; btn.disabled = false;
      setMapStatus(String(e));
    }
  }, (err) => {
    if (err.code === 1) setMapStatus('GPS DENIED — CHECK PERMISSIONS.');
    else if (err.code === 3) setMapStatus('GPS TIMED OUT — TRY AGAIN.');
    else setMapStatus('GPS UNAVAILABLE — TRY AGAIN.');
  }, { timeout: 20000, enableHighAccuracy: false });
}

function clearRoute() {
  if (gDirectionsRenderer) { gDirectionsRenderer.setMap(null); gDirectionsRenderer = null; }
  gMarkers.forEach(m => m.setMap(null)); gMarkers = [];
  gMapJobs.forEach(d => {
    const color = MAP_STATUS_COLORS[d.job.status] || '#FF6B00';
    const marker = new google.maps.Marker({
      position: d.coords, map: gMap, title: d.job.address,
      icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 10 }
    });
    gMarkers.push(marker); d.marker = marker;
  });
  document.getElementById('map-optimize-btn').textContent = 'OPTIMIZE';
  document.getElementById('map-optimize-btn').disabled = gMapJobs.length < 2;
  document.getElementById('map-clear-btn').style.display = 'none';
  document.getElementById('map-reroute-btn').style.display = 'none';
}

// D17: Schedule map refresh at midnight if vector is active
var _lastVectorDate = '';
function _scheduleMidnightRefresh() {
  var now = new Date();
  var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  var ms = midnight - now;
  setTimeout(function() {
    var today = A.todayStr();
    if (_lastVectorDate && _lastVectorDate !== today) {
      // Date changed — refresh the vector board if it's the active screen
      var vectorScreen = document.getElementById('screen-vector');
      if (vectorScreen && vectorScreen.classList.contains('active')) {
        renderMap();
      }
    }
    _lastVectorDate = today;
    _scheduleMidnightRefresh(); // schedule next midnight
  }, ms);
}
_scheduleMidnightRefresh();

// Track current date on every render
var _origRenderMap = renderMap;
renderMap = async function() {
  _lastVectorDate = A.todayStr();
  return _origRenderMap();
};

// ── Public API ──
// ═══════════════════════════════════════════
// Step 6A: Address dedup utilities
// ═══════════════════════════════════════════
function haversineDistance(lat1, lng1, lat2, lng2) {
  var R = 6371000; // Earth radius in meters
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

var STREET_SUFFIXES = {
  'st': 'street', 'str': 'street', 'ave': 'avenue', 'av': 'avenue',
  'dr': 'drive', 'blvd': 'boulevard', 'ln': 'lane', 'ct': 'court',
  'rd': 'road', 'pl': 'place', 'cir': 'circle', 'pkwy': 'parkway',
  'hwy': 'highway', 'trl': 'trail', 'way': 'way'
};
var DIRECTIONALS = {
  'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
  'ne': 'northeast', 'nw': 'northwest', 'se': 'southeast', 'sw': 'southwest'
};

function normalizeAddress(str) {
  if (!str) return '';
  var s = str.toLowerCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
  var words = s.split(' ');
  words = words.map(function(w) {
    if (STREET_SUFFIXES[w]) return STREET_SUFFIXES[w];
    if (DIRECTIONALS[w]) return DIRECTIONALS[w];
    return w;
  });
  return words.join(' ');
}

function findNearDupeAddresses(newAddr, allAddresses, thresholdMeters) {
  thresholdMeters = thresholdMeters || 50;
  var dupes = [];
  var normNew = normalizeAddress(newAddr.address);
  for (var i = 0; i < allAddresses.length; i++) {
    var existing = allAddresses[i];
    if (existing.id === newAddr.id) continue;
    if (existing.dupResolved) continue;
    // Check geocode proximity
    if (newAddr.lat && newAddr.lng && existing.lat && existing.lng) {
      var dist = haversineDistance(newAddr.lat, newAddr.lng, existing.lat, existing.lng);
      if (dist < thresholdMeters) { dupes.push({ address: existing, reason: 'proximity', distance: Math.round(dist) }); continue; }
    }
    // Check normalized string similarity
    var normExisting = normalizeAddress(existing.address);
    if (normNew === normExisting && normNew.length > 0) {
      dupes.push({ address: existing, reason: 'normalized_match' });
    }
  }
  return dupes;
}

Object.assign(window, { loadGmaps, renderMap, optimizeRoute, reroute, clearRoute,
  haversineDistance, normalizeAddress, findNearDupeAddresses });

})();
