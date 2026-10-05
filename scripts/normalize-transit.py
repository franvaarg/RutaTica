"""Build the production GTFS-compatible snapshot from CTP and WGS84 ARESEP paths.
Usage: python3 scripts/normalize-transit.py /path/to/aresep-features.json
No schedules, reverse directions, or landmarks are fabricated.
"""
import sys,json,sqlite3,math,re,unicodedata,hashlib,zlib
from collections import defaultdict
from pathlib import Path

def fold(s):
 return ''.join(c for c in unicodedata.normalize('NFD',s or '') if not unicodedata.combining(c)).lower()
def passenger(s):
 return not re.search(r'\b(plantel|deposito|garaje|garage|cochera|taller|patio de buses|patio de autobuses|oficinas? administrativas?|instalaciones? de la empresa|bus depot|maintenance|bus yard)\b',fold(s))
def km(a,b):
 lat1,lon1,lat2,lon2=map(math.radians,[a['lat'],a['lon'],b['lat'],b['lon']])
 return 6371*2*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2)))
root=Path(__file__).resolve().parent.parent
source=sqlite3.connect(root/'db/custom.db'); source.row_factory=sqlite3.Row
physical=list(source.execute('select * from ctp_stops'))
features=json.load(open(sys.argv[1]))
output=sqlite3.connect(root/'db/normalized.db')
output.executescript('''
CREATE TABLE IF NOT EXISTS NormalizedStop(stop_id TEXT PRIMARY KEY,stop_name TEXT NOT NULL,stop_lat REAL NOT NULL,stop_lon REAL NOT NULL,location_type INTEGER NOT NULL,locality TEXT,district TEXT,canton TEXT,province TEXT,source_id TEXT,feedType TEXT,scheduleType TEXT,search_text TEXT);
CREATE INDEX IF NOT EXISTS normalized_geo ON NormalizedStop(stop_lat,stop_lon);
CREATE TABLE IF NOT EXISTS StopToken(token TEXT NOT NULL,stop_id TEXT NOT NULL,PRIMARY KEY(token,stop_id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS RouteFeed(route_id TEXT PRIMARY KEY,source_id TEXT,shape_id TEXT,route_type INTEGER,feedType TEXT,scheduleType TEXT,south REAL,west REAL,north REAL,east REAL,payload BLOB);
CREATE INDEX IF NOT EXISTS route_bounds ON RouteFeed(south,north,west,east);
CREATE TABLE IF NOT EXISTS RouteStop(route_id TEXT,stop_id TEXT,stop_sequence INTEGER,shape_dist_traveled REAL,PRIMARY KEY(route_id,stop_sequence)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS route_stop_id ON RouteStop(stop_id,route_id);
CREATE TABLE IF NOT EXISTS NormalizationReport(id INTEGER PRIMARY KEY,payload TEXT);
''')
for table in ['NormalizedStop','StopToken','RouteFeed','RouteStop','NormalizationReport']: output.execute('DELETE FROM '+table)
stops={}; grid=defaultdict(list); cell=.002
for row in physical:
 r=dict(row); lat,lon=r['lat'],r['lon']
 if not passenger(r['name']) or not(math.isfinite(lat) and math.isfinite(lon) and 8<=lat<=12 and -86<=lon<=-82): continue
 context=r['district'] or r['canton'] or r['province']
 name=r['name'].strip()
 if not name or (re.fullmatch(r'[\W\d_]+',name) or re.fullmatch(r'parada\s*(?:de\s*(?:bus|autobus)\s*)?[-#:]?\s*\d+',fold(name))) or fold(name) in ['parada','sin nombre','parada de bus','parada de autobus']: name='Parada de bus — '+context
 if name.upper()==name: name=name.lower().capitalize()
 sid='derived:stop:'+hashlib.sha256(r['identityKey'].encode()).hexdigest()[:20]
 s=dict(id=sid,name=name,lat=lat,lon=lon,province=r['province'],canton=r['canton'],district=r['district'])
 stops[sid]=s; grid[(int(lat/cell),int(lon/cell))].append(s)
 search=fold(' '.join(filter(None,[name,r['district'],r['canton'],r['province']])))
 output.execute('INSERT INTO NormalizedStop VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(sid,name,lat,lon,0,context,r['district'],r['canton'],r['province'],r['identityKey'],'DERIVED_GTFS','UNKNOWN',search))
 output.executemany('INSERT OR IGNORE INTO StopToken VALUES(?,?)',[(t,sid) for t in set(re.findall(r'\w+',search)) if len(t)>=2])
accepted=0; rejected=0; route_count=0; associations=0; ordered=0; no_stops=0; points_count=0
for f in features:
 a=f.get('attributes') or f.get('properties') or {}; geometry=f.get('geometry') or {}
 paths=geometry.get('paths') or ([geometry.get('coordinates',[])] if geometry.get('type')=='LineString' else geometry.get('coordinates',[]) if geometry.get('type')=='MultiLineString' else [])
 valid=[]
 for path in paths:
  if len(path)<2 or any(len(p)<2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p[:2]) or not(-86<=p[0]<=-82 and 8<=p[1]<=12) for p in path): continue
  valid.append([dict(lat=p[1],lon=p[0]) for p in path])
 if not valid: rejected+=1; continue
 accepted+=1
 source_id=str(a.get('OBJECTID_1',a.get('OBJECTID','')))
 for pi,path in enumerate(valid):
  rid=f'derived:route:{source_id}:{pi}'; distances=[0]; calls={}
  for i in range(1,len(path)):
   p,b=path[i-1],path[i]; length=km(p,b); along=distances[-1]; distances.append(along+length)
   # Bounding-cell scan for each segment, then strict 50 m projection.
   loLat,hiLat=min(p['lat'],b['lat'])-.0005,max(p['lat'],b['lat'])+.0005
   loLon,hiLon=min(p['lon'],b['lon'])-.0005,max(p['lon'],b['lon'])+.0005
   sx=111.195*math.cos(math.radians(p['lat'])); sy=111.195
   dx=(b['lon']-p['lon'])*sx; dy=(b['lat']-p['lat'])*sy
   for gx in range(int(loLat/cell),int(hiLat/cell)+1):
    for gy in range(int(loLon/cell),int(hiLon/cell)+1):
     for s in grid.get((gx,gy),[]):
      ax=(p['lon']-s['lon'])*sx; ay=(p['lat']-s['lat'])*sy
      t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy or 1)))
      d=math.hypot(ax+t*dx,ay+t*dy)
      if d<=.05 and (s['id'] not in calls or d<calls[s['id']][0]): calls[s['id']]=(d,along+t*length,s)
  sequence=sorted(calls.values(),key=lambda c:(c[1],c[2]['id']))
  if not sequence: no_stops+=1
  if len(sequence)>=2: ordered+=1
  shapes=[dict(shape_id=rid,shape_pt_lat=p['lat'],shape_pt_lon=p['lon'],shape_pt_sequence=i+1,shape_dist_traveled=distances[i]) for i,p in enumerate(path)]
  times=[dict(trip_id=rid+':estimate',stop_id=c[2]['id'],stop_sequence=i+1,shape_dist_traveled=c[1],association='INFERRED',estimated_minutes_from_start=0 if i==0 else math.ceil(c[1]/22*60+i*.4)) for i,c in enumerate(sequence)]
  feed=dict(dataKind='DERIVED_GTFS',feedType='DERIVED_GTFS',scheduleType='ESTIMATED',route=dict(route_id=rid,route_short_name=str(a.get('CODCTP2019') or ''),route_long_name=str(a.get('RUTACTP2019') or ''),route_type=3,route_color='2563EB',operator=None,shape_id=rid),shapes=shapes,stops=[dict(stop_id=c[2]['id'],stop_name=c[2]['name'],stop_lat=c[2]['lat'],stop_lon=c[2]['lon'],location_type=0) for c in sequence],stop_times=times,trip=dict(trip_id=rid+':estimate',route_id=rid,shape_id=rid,scheduleType='ESTIMATED'),durationSource='estimated',directionConfirmed=False,provenance=dict(routeSource='ARESEP',stopSource='CTP',sourceRouteId=source_id,associationMethod='shape_projection_50m',schedules=None))
  output.execute('INSERT INTO RouteFeed VALUES(?,?,?,?,?,?,?,?,?,?,?)',(rid,source_id,rid,3,'DERIVED_GTFS','ESTIMATED',min(p['lat'] for p in path),min(p['lon'] for p in path),max(p['lat'] for p in path),max(p['lon'] for p in path),zlib.compress(json.dumps(feed,separators=(',',':'),ensure_ascii=False).encode(),9)))
  output.executemany('INSERT INTO RouteStop VALUES(?,?,?,?)',[(rid,t['stop_id'],t['stop_sequence'],t['shape_dist_traveled']) for t in times])
  route_count+=1; associations+=len(times); points_count+=len(shapes)
report=dict(originalCtp=len(physical),acceptedPassengerStops=len(stops),rejectedStops=len(physical)-len(stops),derivedStops=len(stops),validStopIds=len(stops),validStopNames=len(stops),validStopCoordinates=len(stops),sourceFeatures=len(features),acceptedGeometries=accepted,rejectedGeometries=rejected,derivedRoutes=route_count,derivedShapes=route_count,shapePoints=points_count,routeStopAssociations=associations,routesWithAssociatedStops=route_count-no_stops,routesWithOrderedSequence=ordered,routesWithoutStops=no_stops,derivedTrips=route_count,derivedStopTimes=associations,scheduleStatus='ESTIMATED; no arrival/departure timetable fields',associationRadiusMeters=50)
output.execute('INSERT INTO NormalizationReport VALUES(1,?)',(json.dumps(report),));output.commit();output.execute('VACUUM');print(json.dumps(report,indent=2))
