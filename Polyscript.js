let map;
let activePath = [];
let activePolyline = null;
let polylines = [];
let tempCursorMarker = null;
let lastClickMarker = null;

let countryBorders = {};   // will hold borders for multiple countries
let activeBorder = null;   // currently selected border (e.g., India)

let borderClickCount = 0;
let borderPointA = null;
let borderPointB = null;
let borderDisplay = null;  // faint country outline

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 20.5937, lng: 78.9629 },
    zoom: 5,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    zoomControl: true,
    styles: [
      {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      }
    ]
  });

  const zoomLabel = document.getElementById("zoomLabel");
  const updateZoomLabel = () => {
    zoomLabel.textContent = `Zoom: ${map.getZoom().toFixed(1)}`;
  };
  updateZoomLabel();
  map.addListener("zoom_changed", updateZoomLabel);

  // ---------------- MAP CLICK HANDLER ----------------
  map.addListener("click", (ev) => {
    const lat = ev.latLng.lat();
    const lng = ev.latLng.lng();

    // -------- NORMAL POLYLINE DRAWING (YOUR TOOL) --------
    activePath.push({ lat, lng });

    if (!activePolyline) {
      activePolyline = new google.maps.Polyline({
        path: activePath,
        geodesic: true,
        strokeColor: getRandomColor(),
        strokeOpacity: 1.0,
        strokeWeight: 3,
        map: map
      });
      polylines.push(activePolyline);
    } else {
      activePolyline.setPath(activePath);
    }

    syncTextFromActivePath();

    // ---- SINGLE RED DOT MARKER (CLEAN) ----
    if (lastClickMarker) lastClickMarker.setMap(null);

    lastClickMarker = new google.maps.Marker({
      position: ev.latLng,
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 4,
        fillColor: "#ff0000",
        fillOpacity: 1,
        strokeWeight: 1
      }
    });

    // ------------- BORDER FOLLOWING LOGIC -------------
    if (!activeBorder) return;  // do nothing if border not loaded

    borderClickCount++;

    if (borderClickCount === 1) {
      borderPointA = findNearestBorderPoint(ev.latLng, activeBorder);
    }
    else if (borderClickCount === 2) {
      borderPointB = findNearestBorderPoint(ev.latLng, activeBorder);

      const segment = extractBorderSegment(
        activeBorder,
        borderPointA,
        borderPointB
      );

      // Draw CLEARLY VISIBLE border-following polyline
      const borderPolyline = new google.maps.Polyline({
        path: segment,
        map: map,
        strokeColor: "#ff0000", // RED so you can clearly see it
        strokeWeight: 4,
        zIndex: 1000
      });

      polylines.push(borderPolyline);

      // Reset for next use
      borderClickCount = 0;
      borderPointA = null;
      borderPointB = null;
    }
  });

  // --------- UI EVENT LISTENERS ---------
  document.getElementById('coords')
    .addEventListener('keyup', handleCaretMove);
  document.getElementById('coords')
    .addEventListener('click', handleCaretMove);

  document.getElementById("newPoly")
    .addEventListener("click", startNewPoly);
  document.getElementById("clearPolys")
    .addEventListener("click", clearAllPolys);
  document.getElementById("encodeBtn")
    .addEventListener("click", encodePolyline);
  document.getElementById("addPoly")
    .addEventListener("click", addEncodedPoly);
  document.getElementById("undoPoly")
    .addEventListener("click", undoLastPoint);
  document.getElementById("loadIndia")
    .addEventListener("click", loadIndiaBorder);
}

// ================= LOAD & DRAW INDIA BORDER =================

function loadIndiaBorder() {
  fetch("india_border.geojson")
    .then(res => res.json())
    .then(data => {

      let allCoords = [];

      const geom = data.features[0].geometry;

      if (geom.type === "Polygon") {
        allCoords = geom.coordinates[0];
      }
      else if (geom.type === "MultiPolygon") {
        // Flatten all outer rings of all polygons
        geom.coordinates.forEach(poly => {
          allCoords = allCoords.concat(poly[0]);
        });
      }

      // Convert [lng, lat] -> {lat, lng}
      countryBorders["India"] = allCoords.map(c => ({
        lat: c[1],
        lng: c[0]
      }));

      activeBorder = countryBorders["India"];

      borderClickCount = 0;
      borderPointA = null;
      borderPointB = null;

      drawIndiaBorder();   // <-- IMPORTANT

      alert("India border loaded. Click two points on the border.");
    })
    .catch(err => console.error("Error loading India border:", err));
}

function drawIndiaBorder() {
  if (!activeBorder) return;

  if (borderDisplay) borderDisplay.setMap(null);

  borderDisplay = new google.maps.Polyline({
    path: activeBorder,
    map: map,
    strokeColor: "#888888",   // light grey background border
    strokeOpacity: 0.7,
    strokeWeight: 2
  });

  polylines.push(borderDisplay);
}

// ================= EXISTING TOOL FUNCTIONS (CLEANED) =================

function syncTextFromActivePath() {
  document.getElementById("coords").value =
    activePath.map(p => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`).join("\n");
}

function parseLatLng(line) {
  if (!line) return null;
  const m = line.match(/(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[3]) };
}

function handleCaretMove(ev) {
  const ta = ev.target;
  const pos = ta.selectionStart;

  const lines = ta.value.split("\n");
  const upto = ta.value.substring(0, pos);
  const index = upto.split("\n").length - 1;

  const point = parseLatLng(lines[index]);
  if (!point) {
    if (tempCursorMarker) {
      tempCursorMarker.setMap(null);
      tempCursorMarker = null;
    }
    return;
  }

  if (tempCursorMarker) tempCursorMarker.setMap(null);

  tempCursorMarker = new google.maps.Marker({
    position: point,
    map: map,
    icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" }
  });

  map.panTo(point);
}

function startNewPoly() {
  activePath = [];
  activePolyline = null;

  document.getElementById("coords").value = "";
  document.getElementById("encoded").value = "";

  if (tempCursorMarker) { tempCursorMarker.setMap(null); tempCursorMarker = null; }
  if (lastClickMarker) { lastClickMarker.setMap(null); lastClickMarker = null; }
}

function createDotMarker(position, color = "#ff0000") {
  return new google.maps.Marker({
    position,
    map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 3,
      fillColor: color,
      fillOpacity: 0.75,
      strokeWeight: 0
    }
  });
}

function undoLastPoint() {
  if (activePath.length === 0) return;

  activePath.pop();

  if (activePath.length === 0) {
    if (activePolyline) {
      activePolyline.setMap(null);
      polylines.pop();
      activePolyline = null;
    }
  } else {
    activePolyline.setPath(activePath);
  }

  syncTextFromActivePath();

  if (lastClickMarker) {
    lastClickMarker.setMap(null);
    lastClickMarker = null;
  }

  if (activePath.length > 0) {
    const last = activePath[activePath.length - 1];
    lastClickMarker = createDotMarker(last);
  }
}

function clearAllPolys() {
  polylines.forEach(p => p.setMap(null));
  polylines = [];

  activePath = [];
  activePolyline = null;

  document.getElementById("coords").value = "";
  document.getElementById("encoded").value = "";

  if (tempCursorMarker) {
    tempCursorMarker.setMap(null);
    tempCursorMarker = null;
  }

  if (lastClickMarker) {
    lastClickMarker.setMap(null);
    lastClickMarker = null;
  }

  borderDisplay = null;
}

function getRandomColor() {
  const colors = ["#008000", "#0000FF", "#FFA500", "#800080", "#00CED1"];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ========== BORDER HELPERS ==========

function findNearestBorderPoint(clickLatLng, border) {
  let minDist = Infinity;
  let nearestIndex = 0;

  border.forEach((p, i) => {
    const d = Math.hypot(
      p.lat - clickLatLng.lat(),
      p.lng - clickLatLng.lng()
    );
    if (d < minDist) {
      minDist = d;
      nearestIndex = i;
    }
  });

  return nearestIndex;
}

function extractBorderSegment(border, i1, i2) {
  if (i1 < i2) {
    return border.slice(i1, i2 + 1);
  } else {
    const path1 = border.slice(i1).concat(border.slice(0, i2 + 1));
    const path2 = border.slice(i2, i1 + 1);
    return path1.length < path2.length ? path1 : path2;
  }
}

// ========== KEYBOARD UNDO ==========
document.addEventListener("keydown", function (e) {
  const isUndo =
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "z";

  if (!isUndo) return;

  const tag = document.activeElement.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return;

  e.preventDefault();
  undoLastPoint();
});

function getRandomColor() {
const colors = ["#008000", "#0000FF", "#FFA500", "#800080", "#00CED1"];
return colors[Math.floor(Math.random() * colors.length)];
}

function encodeCoordinate(val) {
let e = Math.round(val * 1e5); e <<= 1;
if (val < 0) e = ~e; let output = "";
while (e >= 0x20) { output += String.fromCharCode((0x20 | (e & 0x1f)) + 63); e >>= 5;
}

output += String.fromCharCode(e + 63); return output;
}

function encodePolyline() {
const lines = document.getElementById("coords").value.split("\n");
let lastLat = 0,
lastLng = 0;
let result = "";
for (const line of lines) {
const p = parseLatLng(line);
if (!p) continue;
const lat = Math.round(p.lat * 1e5);
const lng = Math.round(p.lng * 1e5);
const dLat = lat - lastLat;
const dLng = lng - lastLng;
result += encodeCoordinate(dLat / 1e5);
result += encodeCoordinate(dLng / 1e5);
lastLat = lat; lastLng = lng;
}
document.getElementById("encoded").value = result;
}

function decodePolyline(encoded) {
let index = 0,
lat = 0,
lng = 0;
const coordinates = [];
while (index < encoded.length) {
let b,
shift = 0,
result = 0;
do {
b = encoded.charCodeAt(index++) - 63;
result |= (b & 0x1f) << shift; shift += 5;
}

while (b >= 0x20);
const dLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
lat += dLat;
shift = 0;
result = 0;
do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); const dLng = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += dLng; coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 }); } return coordinates; } function addEncodedPoly() { const encoded = document.getElementById("encoded").value.trim(); if (!encoded) return alert("Please enter an encoded polyline first."); const path = decodePolyline(encoded);  activePath = path.map(p => ({ lat: p.lat, lng: p.lng }));  if (activePolyline) { activePolyline.setMap(null); } activePolyline = new google.maps.Polyline({ path: activePath, geodesic: true, strokeColor: "#000000", strokeOpacity: 1.0, strokeWeight: 3, map: map }); polylines.push(activePolyline);  syncTextFromActivePath(); map.panTo(activePath[activePath.length - 1]); if (lastClickMarker) lastClickMarker.setMap(null); lastClickMarker = new google.maps.Marker({ position: activePath[activePath.length - 1], map: map }); }
