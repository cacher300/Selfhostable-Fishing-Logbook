import test from "node:test";
import assert from "node:assert/strict";
import { basicSizeStats, basicStatsTables, buildBasicStats, buildStats, comparisonCount, comparisonRows, comparisonTable, formatStat, nextTableSort, overviewStats, piePlot, reportForMethod, statsDateOptions, statsFilterOptions, trendPlot } from "../static/js/stats-workbench-model.js";

const today = new Date(2026, 6, 15);
const trip = (id, patch = {}) => ({id, date:"2026-07-01", location:"Lake", method:"Trolling", targetSpecies:"Walleye", catches:[], lostFish:[], gearUsed:[], ...patch});
const book = (...trips) => ({trips, lures:[{id:"a",name:"Spoon A",color:"Blue"},{id:"b",name:"Spoon B",color:"Gold"}]});
const line = (id,lureId,startTime,endTime,extra = {}) => ({id,lureId,startTime,endTime,...extra});
const run = (b, report, opts = {}, scope = {}) => buildStats(b,scope,{report,...opts},today);
const group = (m,name) => m.rows.find(r => r.name === name).values;

test("Basic uses the same scope and effort for trip rankings and measured fish records", () => {
  const setup = line("rod","a","23:30","02:30",{hasCheater:true,cheaterLureId:"b"});
  const b = book(trip("night",{launchTime:"23:00",linesPulledTime:"03:00",idleHours:1,gearUsed:[setup],
    waterClarity:"Clear",weather:"Rain",waveChop:"Light",
    catches:[{species:"Walleye",setupLineId:"rod",setupLineTarget:"cheater",quantity:3,released:true,length:"50 cm",weight:"3 lb"},
      {species:"Perch",setupLineId:"rod",length:"unknown",weight:"1 kg"}],
    lostFish:[{possibleSpecies:"Trout",quantity:2}]}),
  trip("skunk",{hours:1,waterClarity:"Clear"}),trip("untimed",{date:"2026-07-02",catches:[{species:"Perch",quantity:2,length:"26 in"}]}),
  trip("active",{liveStatus:"active",catches:[{quantity:12}]}),trip("paused",{liveStatus:"paused"}),trip("draft",{isDraft:true}));
  const basic = buildBasicStats(b,{},today);
  assert.equal(basic.daysFished,2);
  assert.deepEqual(basic.totals,run(b,"location").totals);
  const { trips,hours,fish,lost,released,fishPerHour,measured } = basic.totals;
  assert.deepEqual([trips,hours,fish,lost,released,fishPerHour,measured],[3,4,6,2,3,1,2]);
  assert.deepEqual(basic.longest,{species:"Perch",value:26});
  assert.deepEqual(basic.heaviest,{species:"Walleye",value:3});
  const sizeStats = basicSizeStats(basic);
  assert.equal(sizeStats.find(r => r.label === "Shortest fish").value,"19.69 in");
  assert.equal(sizeStats.find(r => r.label === "Lightest fish").value,"2.2 lb");
  assert.deepEqual(basic.mostProductiveTrips.map(r => [r.fish,r.hours,r.rate]),[[4,3,4/3],[2,null,null]]);
  assert.deepEqual(basic.breakdowns.find(g => g.id === "species").rows.map(r => [r.name,r.fish,r.trips]),
    [["Perch",3,2],["Walleye",3,1]]);
  assert.deepEqual(basic.lureStats.find(r => r.name === "Spoon B"),{name:"Spoon B",fish:3,timedFish:3,hours:3,rate:1});
  assert.deepEqual(basic.breakdowns.find(g => g.id === "clarity").rows,[{name:"Clear",fish:4,trips:2,hours:4,rate:1}]);
  const scoped = buildBasicStats(b,{date:"custom",from:"2026-07-01",to:"2026-07-01",waterClarity:"Clear",species:"Walleye",lure:"Spoon B"},today);
  assert.deepEqual([scoped.totals.trips,scoped.totals.fish,scoped.totals.lost,scoped.totals.hours],[1,3,0,3]);
});

test("Basic caps rankings at five and separates total lure catches from timed effort", () => {
  const lures = Array.from({length:7}, (_, i) => ({id:`lure-${i}`,name:`Lure ${i}`}));
  const trips = lures.map((lure, i) => trip(`trip-${i}`,{
    title:`Trip ${i}`, launchTime:"07:00", linesPulledTime:"10:00",
    gearUsed:i ? [line(`line-${i}`,lure.id,"07:00",i === 1 ? "07:30" : "09:00")] : [],
    catches:[{species:"Walleye",lureId:lure.id,setupLineId:i ? `line-${i}` : undefined,time:"07:15",quantity:8-i}]
  }));
  trips.push(trip("unused",{gearUsed:[line("unused","lure-1","09:00","11:00")]}));
  const tables = basicStatsTables(buildBasicStats({ lures, trips },{},today));
  const rows = id => tables.find(table => table.id === id).rows;
  assert.deepEqual(rows("trips").map(row => row.name),["Trip 0","Trip 1","Trip 2","Trip 3","Trip 4"]);
  assert.equal(rows("lures").length,5);
  assert.deepEqual(rows("lures")[0],{name:"Lure 0",detail:undefined,values:["8","—","—"]});
  assert.equal(rows("lureRates").length,5);
  assert.equal(rows("lureRates")[0].name,"Lure 2");
  assert.deepEqual(rows("lureRates").find(row => row.name === "Lure 1").values,["2.8","7","2.5"]);
});

test("new reports retain sparse observations and keep bite facts apart from timed gear", () => {
  const b = book(trip("rod-trip",{ waveHeight:"2 ft",weatherData:{marine:{waveHeightM:3},tripWindow:{precipitationIn:0}},
    gearUsed:[line("rod","a","07:00","09:00",{comboId:"combo",hasCheater:true,cheaterLureId:"b",lineOut:"90 ft"})],
    catches:[{setupLineId:"rod",setupLineTarget:"cheater",time:"08:00",quantity:2,lineOut:"12 m"}]}),
  trip("without-observations"));
  b.settings = {units:{waveHeight:"m",depth:"m"}};
  b.rods = [{id:"r",power:"Medium"}];
  b.reels = [{id:"e",style:"Line counter"}];
  b.rodReelCombos = [{id:"combo",rodId:"r",reelId:"e"}];
  const gear = run(b,"reelStyle");
  assert.equal(gear.chart,"table");
  assert.equal(gear.active.id,"reelStyle");
  assert.ok(gear.compareOptions.some(report => report.id === "reelStyle"));
  assert.deepEqual([group(gear,"Line counter").hours,group(gear,"Line counter").fish],[2,2]);
  const bite = run(b,"lineOut");
  assert.deepEqual(bite.rows.map(r => [r.name,r.values.fish,r.tripIds]),[["12–15 m",2,["rod-trip"]]]);
  assert.ok(!bite.columns.some(c => c.id === "hours"));
  assert.deepEqual(run(b,"waveHeight").rows.map(r => r.name),["0.5–1 m"]);
  assert.deepEqual(run(b,"precipitation").rows.map(r => r.name),["Dry"]);
  const empty = run(b,"waveDirection");
  assert.equal(empty.active.id,"waveDirection");
  assert.deepEqual(empty.rows,[]);
});

test("hiding zero results filters groups and statistics before pagination without removing catchless effort from rates", () => {
  const m = run(book(trip("active",{location:"A",hours:2,catches:[{quantity:4}]}),trip("active2",{location:"B",hours:2,catches:[{}],lostFish:[{}]}),
    trip("quiet",{location:"C",hours:4}),trip("untimed",{location:"D",catches:[{quantity:3}]})),"location",{metric:"fishPerHour"});
  const table = comparisonTable(m,"","",{key:"group",direction:"ascending"},1,true);
  assert.deepEqual(table.rows.map(r => r.label),["A"]);
  assert.equal(comparisonCount(m,comparisonRows(m,true),table),"2 of 4 groups");
  assert.ok(table.columns.some(c => c.id === "lost")); // The only loss is on the next page.
  assert.ok(!table.columns.some(c => c.id === "skunk"));
  assert.deepEqual(comparisonRows(m,true).map(r => r.name),["A","B"]);
  assert.equal(group(m,"C").fishPerHour,0); assert.equal(group(m,"D").fishPerHour,null);
  assert.equal(m.totals.fishPerHour,5/8); assert.equal(m.totals.fish,8);
  assert.equal(comparisonTable(m).total,4);
  const quiet = run(book(trip("quiet",{hours:3})),"location");
  assert.deepEqual(overviewStats(quiet,true).map(s => s.label),["Trips","Fishing hours","Skunk rate"]);
  assert.equal(overviewStats(quiet).find(s => s.label === "Fish / hour").value,"0");
});

test("empty matrix axes disappear but comparable zeros, missing cells and paired measures remain distinct", () => {
  const outing = (location,waterClarity,n) => trip(location+waterClarity,{location,waterClarity,hours:1,catches:n ? [{quantity:n}] : []});
  const b = book(outing("A","Clear",3),outing("A","Stained",0),outing("B","Stained",2),outing("C","Clear",0),outing("B","Muddy",0));
  const m = run(b,"location",{metric:"fish",split:"waterClarity"});
  const table = comparisonTable(m,"","",null,12,true);
  assert.deepEqual(table.columns.slice(1).map(c => c.label),["Clear","Stained"]);
  assert.deepEqual(table.rows.map(r => r.label),["A","B"]);
  assert.equal(table.rows[0].cells[1].text,"0"); assert.ok(table.rows[0].cells[1].key);
  assert.equal(table.rows[1].cells[0],null);
  const pair = run(b,"location",{a:"A",b:"C",metric:"lost"});
  const head = comparisonTable(pair,"A","C",null,12,true);
  assert.ok(!head.rows.some(r => r.label === "Lost"));
  assert.deepEqual(head.rows.find(r => r.label === "Landed").cells.map(c=>c.text),["3","0"]);
});

test("hiding zero trend points leaves gaps and keeps negative and tiny measurements", () => {
  const rows = [-1,0,0.001,null,-2].map((v,i) => ({name:`${i*10} ft`,key:String(i),values:{temperature:v}}));
  const plot = trendPlot(rows,"temperature","probe",true);
  assert.deepEqual(plot.segments.map(points => points.map(p=>p.value)),[[-1],[0.001],[-2]]);
  assert.deepEqual([plot.first,plot.last],["0 ft","40 ft"]);
  assert.deepEqual([formatStat(.001),formatStat(-.001,"%"),formatStat(0),formatStat(null)],["<0.01",">-0.01%","0","—"]);
  assert.equal(trendPlot(rows,"temperature","probe").points.length,4);
});

test("table headers sort the whole comparison numerically in both directions, keeping missing rates last", () => {
  const m = run(book(trip("ten",{location:"Lake 10",hours:2,catches:[{quantity:20}]}),trip("two",{location:"Lake 2",hours:2,catches:[{quantity:4}]}),
    trip("zero",{location:"Lake 1",hours:1}),trip("unknown",{location:"Lake 3",catches:[{quantity:40}]})),"location",{metric:"fish"});
  const table = (order,limit) => comparisonTable(m,undefined,undefined,order,limit);
  const labels = t => t.rows.map(r => r.label);
  const high = nextTableSort(table().sort,"fishPerHour"), low = nextTableSort(high,"fishPerHour");
  assert.deepEqual(labels(table(high)),["Lake 10","Lake 2","Lake 1","Lake 3"]);
  assert.deepEqual(labels(table(low)),["Lake 1","Lake 2","Lake 10","Lake 3"]);
  assert.deepEqual(labels(table(low,2)),["Lake 1","Lake 2"]);
  const az = nextTableSort(low,"group");
  assert.deepEqual(labels(table(az)),["Lake 1","Lake 2","Lake 3","Lake 10"]);
  assert.deepEqual(labels(table(nextTableSort(az,"group"))),["Lake 10","Lake 3","Lake 2","Lake 1"]);
  assert.deepEqual(m.rows.map(r => r.name),["Lake 3","Lake 10","Lake 2","Lake 1"]);
});

test("split and head-to-head column headers use underlying measurements, not formatted text or source trip counts", () => {
  const b = book(trip("high",{location:"West",waterClarity:"Clear",hours:3,catches:[{quantity:31}]}),
    trip("low",{location:"East",waterClarity:"Clear",hours:2,catches:[{quantity:5}]}),
    trip("other",{location:"North",waterClarity:"Stained",hours:2}));
  const split = run(b,"location",{split:"waterClarity"}), clear = {key:"group:Clear",direction:"descending"};
  const visible = comparisonTable(split,undefined,undefined,nextTableSort(clear,clear.key),2);
  assert.deepEqual(visible.rows.map(r => [r.label,r.cells[0].text]),[["East","2.5"],["West","10.33"]]);
  const high = comparisonTable(split,undefined,undefined,clear);
  assert.deepEqual(high.rows.map(r => r.label),["West","East","North"]);
  assert.equal(high.rows.at(-1).cells[0],null);
  const paired = run(b,"location",{a:"East",b:"West"});
  const pairTable = comparisonTable(paired,"East","West",{key:"group:West",direction:"ascending"});
  const west = pairTable.rows.map(r => parseFloat(r.cells[1].text)).filter(Number.isFinite);
  assert.ok(west.includes(10.33) && west.includes(3));
  assert.deepEqual(west,[...west].sort((a,b) => a-b));
});

test("pie shares keep every filtered group and its supporting trips separate", () => {
  const catches = Array.from({length:14},(_,i) => ({species:`Species ${i+1}`,quantity:i+1}));
  const b = book(trip("first",{catches:catches.slice(0,4)}),trip("second",{catches:catches.slice(4)}),
    trip("august",{date:"2026-08-01",catches:[{species:"Salmon",quantity:40}]}));
  const m = run(b,"species",{metric:"catchShare"},{month:"July"});
  const {slices} = piePlot(m);
  assert.equal(m.rows.length,14);
  assert.equal(slices.length,14);
  assert.ok(slices.every(slice => !slice.name.startsWith("Other")));
  assert.equal(slices.reduce((n,s)=>n+s.value,0),105);
  assert.deepEqual([slices[0].name,slices[0].value,slices[0].share],["Species 14",14,"13.33%"]);
  assert.deepEqual([slices.at(-1).name,slices.at(-1).value], ["Species 1",1]);
  assert.deepEqual(slices.at(-1).tripIds,["first"]);
  assert.equal(piePlot(run(b,"species",{metric:"lost"})).slices.length,0);
});

test("pie charts do not normalize rates, overlapping categories or repeat trip counts", () => {
  const b = book(trip("timed",{hours:2,gearUsed:[line("rod","a","07:00","09:00")],catches:[
    {setupLineId:"rod",species:"Perch"},{setupLineId:"rod",species:"Walleye"}]}),trip("untimed",{location:"Another lake"}));
  b.lures[0].color = "Blue/Silver";
  const rate = piePlot(run(b,"lure",{metric:"fishPerHour"}));
  assert.equal(rate.slices.length,0); assert.equal(rate.suggestion.id,"fish");
  assert.equal(piePlot(run(b,"species",{metric:"trips"})).slices.length,0);
  assert.equal(piePlot(run(b,"species",{metric:"fish",split:"lureColorFamily"})).slices.length,0);
  const hours = piePlot(run(b,"location",{metric:"hours"})).slices;
  assert.deepEqual(hours.map(s=>[s.name,s.value,s.share]),[["Lake",2,"100%"]]);
});

test("overview and trip rates count quantities, skunks and only measured effort; lost species stay unconfirmed", () => {
  const b = book(trip("yes",{linesSetTime:"23:00",launchTime:"22:00",linesPulledTime:"03:00",idleHours:1,catches:[{species:"Walleye",quantity:3,released:true}],lostFish:[{possibleSpecies:"Perch",quantity:2}]}),
    trip("zero",{hours:1}),trip("untimed",{catches:[{species:"Walleye",quantity:2}]}),trip("live",{liveStatus:"active",hours:9}));
  const m = run(b,"target"), v = m.totals;
  assert.deepEqual([v.trips,v.hours,v.fish,v.lost,v.timedFish,v.fishPerHour,v.kept,v.released],[3,4,5,2,3,.75,2,3]);
  assert.equal(v.landingPercentage, 5/7*100);
  assert.ok(Math.abs(v.skunk - 100/3) < 1e-10);
  assert.equal(group(m,"Walleye").targetRate,2/3*100);
  assert.deepEqual(run(b,"species").rows.map(r => r.name),["Walleye"]);
  assert.equal(group(run(b,"lostSpecies"),"Perch").lost,2);
  const perch = run(b,"location",{}, {species:"Perch"});
  assert.equal(perch.totals.trips,3); assert.equal(perch.totals.fishPerHour,0);
  assert.equal(run(book(trip("untimed",{catches:[{quantity:4}]})),"location").totals.fishPerHour,null);
});

test("paired line-hours use only overlapping times across midnight, not double-counted counterpart rods", () => {
  const b = book(trip("night",{launchTime:"22:00",linesPulledTime:"03:00",gearUsed:[
    line("one","a","22:30","02:00"),line("two","b","23:30","00:30"),line("three","b","00:00","01:30")],
    catches:[{setupLineId:"one",time:"23:00",quantity:8},{setupLineId:"one",time:"00:10",quantity:2},{setupLineId:"one",timeUnknown:true,quantity:4},{setupLineId:"one",time:"01:30"}],
    lostFish:[{setupLineId:"two",time:"00:05"}]}),trip("other",{gearUsed:[line("four","a","10:00","13:00")]}));
  const m = run(b,"lure",{a:"Spoon A",b:"Spoon B",matched:true});
  assert.deepEqual([group(m,"Spoon A").fish,group(m,"Spoon A").hours,group(m,"Spoon A").fishPerHour],[2,2,1]);
  assert.deepEqual([group(m,"Spoon B").fish,group(m,"Spoon B").lost,group(m,"Spoon B").hours],[0,1,2.5]);
  assert.deepEqual(m.rows[0].tripIds,["night"]);
  assert.equal(group(run(b,"lure"),"Spoon A").hours,6.5);
});

test("a main line and its cheater credit the right lure without doubling physical side effort", () => {
  const b = book(trip("rigger",{waterClarity:"Clear",gearUsed:[line("main","a","08:00","10:00",{side:"Port",hasCheater:true,cheaterLureId:"b",presentation:"Downrigger"})],
    catches:[{setupLineId:"main",setupLineTarget:"cheater",quantity:4,time:"09:00",species:"Walleye",dipseySetting:"3"}]}));
  assert.equal(group(run(b,"lureColor",{split:"waterClarity"}),"Gold").fishPerHour,2);
  assert.deepEqual([group(run(b,"lineSide"),"Port").fishPerHour,group(run(b,"lineSide"),"Port").hours],[2,2]);
  const timeless = run(b,"lureColor",{split:"dipseySetting",metric:"fishPerHour"});
  assert.equal(timeless.metric,"fish"); assert.ok(!timeless.columns.some(c => c.id === "hours"));
});

test("windows include zero-catch clock hours; daily idle is not invented as clock effort", () => {
  const b = book(trip("overnight",{launchTime:"23:30",linesPulledTime:"01:30",catches:[{time:"00:20",quantity:2}]}),
    trip("idle",{launchTime:"00:00",linesPulledTime:"02:00",idleHours:.5,catches:[{time:"00:05",quantity:3}]}));
  const m = run(b,"hour"), v = group(m,"00:00");
  assert.deepEqual([v.fish,v.timedFish,v.hours,v.fishPerHour],[5,2,1,2]);
  assert.equal(group(m,"23:00").fishPerHour,0); assert.equal(group(m,"01:00").hours,.5);
  assert.equal(trendPlot(m.rows,m.metric,"hour").segments.length,2);
});

test("method-specific choices, measured samples and same-date season comparisons", () => {
  const b = book(trip("past",{date:"2025-07-14",method:"Casting",hours:1,catches:[{length:"1 m",species:"Perch",quantity:3}]}),
    trip("later",{date:"2025-07-16",method:"Casting",hours:2}),trip("now",{method:"Casting",hours:2,catches:[{length:"20 in",species:"Perch"},{species:"Perch"}]}));
  const season = run(b,"season",{}, {method:"Casting",date:"season"});
  assert.deepEqual(season.evidence.map(t => t.id),["past","now"]);
  assert.ok(!season.reports.some(x => x.id === "gpsSpeed")); assert.ok(season.reports.some(x => x.id === reportForMethod("Casting")));
  const size = group(run(b,"sizes",{threshold:30}),"Perch");
  assert.equal(size.fish,5); assert.equal(size.measured,2); assert.equal(size.over,50); assert.ok(Math.abs(size.maxLength - 39.37) < .01);
});

test("efficiency uses only timed catch share and retired setup fields never become bite observations", () => {
  const b = book(trip("timed",{gearUsed:[line("left","a","07:00","09:00",{gpsSpeed:6,distanceBehind:90}),line("right","b","07:00","09:00")],
    catches:[{setupLineId:"left",time:"08:00",distanceBehind:""}, {setupLineId:"right",time:"08:15"}]}),
    trip("unknown",{catches:[{lureId:"a",quantity:8}],lostFish:[{species:"Perch",quantity:2}]}));
  const v = group(run(b,"lure"),"Spoon A");
  assert.deepEqual([v.fish,v.timedFish,v.timedCatchShare,v.timeShare,v.efficiencyIndex],[9,1,50,50,1]);
  assert.equal(run(b,"gpsSpeed").rows.length,0);
  assert.equal(run(b,"distanceBehind").rows[0].values.fishPerHour,.5);
  assert.equal(group(run(b,"lostSpecies",{}, {species:"Perch"}),"Perch").lost,2);
  assert.equal(group(run(b,"lineTarget"),"Main").fish,2);
  const untimedGear = book(trip("known-lure",{catches:[{lureId:"a",quantity:3}]}));
  assert.equal(run(untimedGear,"lure").metric,"fish");
  assert.equal(group(run(untimedGear,"lure",{metric:"fishPerHour"}),"Spoon A").fishPerHour,null);
  const idle = run(book(trip("idle",{launchTime:"07:00",linesPulledTime:"09:00",idleHours:2})),"location");
  assert.equal(idle.totals.hours,0); assert.equal(idle.totals.fishPerHour,null);
  assert.equal(run(book(trip("unknown")),"location").totals.hours,null);
});

test("moon-window effort crosses midnight and includes the final minute of the rise window", () => {
  const b = book(trip("night",{launchTime:"23:30",linesPulledTime:"02:00",weatherData:{sunMoon:{moonrise:"00:15",moonset:"09:00"}},
    catches:[{time:"01:45",quantity:2},{time:"01:46"}]}));
  const m = run(b,"moonWindow"), near = group(m,"Moonrise"), outside = group(m,"Outside moon windows");
  assert.deepEqual([near.timedFish,outside.timedFish],[2,1]);
  assert.ok(Math.abs(near.hours * 60 - 136) < 1e-8);
  assert.ok(Math.abs(outside.hours * 60 - 14) < 1e-8);
});

test("date and method choices come from completed history; custom dates include both ends and skunks", () => {
  const b = book(trip("first",{date:"2024-02-29",method:"Handlining"}),
    trip("last",{date:"2024-03-01",hours:2,catches:[{quantity:3}]}),trip("outside",{date:"2025-01-01"}),
    trip("draft",{date:"2023-01-01",method:"Casting",isDraft:true}),trip("active",{date:"2026-01-01",method:"Jigging",liveStatus:"active"}));
  b.methods = ["Trolling","Casting","Fly Fishing"];
  assert.deepEqual(statsFilterOptions(b).method,["Handlining","Trolling"]);
  assert.deepEqual(statsDateOptions(b.trips).map(o=>o.id).filter(id=>/^\d{4}$/.test(id)),["2025","2024"]);
  const scope = {date:"custom",from:"2024-02-29",to:"2024-03-01"};
  const m = run(b,"location",{},scope);
  assert.deepEqual(m.trips.map(t=>t.id),["first","last"]);
  assert.equal(m.totals.fish,3);
  assert.equal(run(b,"location",{},{...scope,to:scope.from}).totals.trips,1);
  for (const bad of ["","2024-02-28","2024-02-30"]) {
    const invalid = run(b,"season",{},{...scope,to:bad});
    assert.ok(invalid.dateWindow.error); assert.equal(invalid.evidence.length,0);
  }
  assert.equal(run(b,"location",{},{date:"2025"}).totals.trips,1);
  const overlap = run(b,"season",{},{date:"custom",from:"2024-01-01",to:"2025-12-31"});
  assert.equal(group(overlap,"2024-01-01 to 2025-12-31").trips,3);
  assert.equal(group(overlap,"2023-01-01 to 2024-12-31").trips,2);
});
