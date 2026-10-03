/**
 * Zwei Abrufe vom 2026-10-03 um 01:24 UTC, gleichzeitig: DEs eigener
 * Weltzustand (api.warframe.com/cdn/worldState.php) und die Antwort von
 * warframestat.us. warframestat.us lag dabei gut zwei Minuten zurueck und
 * fuehrte alle Eintraege, die DE fuehrte - ein Paar, an dem sich pruefen
 * laesst, ob Argus aus DEs Rohform dieselben Namen macht.
 *
 * Gekuerzt auf je einen Eintrag pro Besonderheit: ein normaler Riss, ein
 * Steel-Path-Riss, ein Void Flood, ein Alchemy-Riss, zwei Railjack-Stuerme,
 * Kopfgelder mit Narmer-Auftrag und Isolation Vault, ein Syndikat mit
 * Knoten, je eine Invasion gegen die Infestation und ohne, der Tenno-United-
 * Alert, Baro mit drei Waren, Darvo und je ein taeglicher, woechentlicher
 * und Elite-Akt. KNOTEN ist der passende Ausschnitt der Knotentabelle
 * (api.warframestat.us/solNodes, Stand 2026-09-30).
 */

export const DE = {
  "Time": 1790990630,
  "ActiveMissions": [
    {"_id":{"$oid":"6ac042ee17a0328c56f18d62"},"Region":9,"Seed":91796,"Activation":{"$date":{"$numberLong":"1790984942904"}},"Expiry":{"$date":{"$numberLong":"1790990965284"}},"Node":"SolNode102","MissionType":"MT_INTEL","Modifier":"VoidT4"},
    {"_id":{"$oid":"6ac043a2d70b134405efac8e"},"Region":11,"Seed":17363,"Activation":{"$date":{"$numberLong":"1790985122634"}},"Expiry":{"$date":{"$numberLong":"1790990958119"}},"Node":"SolNode153","MissionType":"MT_RESCUE","Modifier":"VoidT4","Hard":true},
    {"_id":{"$oid":"6ac049439487466d1afc584e"},"Region":22,"Seed":47302,"Activation":{"$date":{"$numberLong":"1790986563086"}},"Expiry":{"$date":{"$numberLong":"1790991331577"}},"Node":"SolNode230","MissionType":"MT_CORRUPTION","Modifier":"VoidT6","Hard":true},
    {"_id":{"$oid":"6ac0531a3f901a7119dec52a"},"Region":17,"Seed":13608,"Activation":{"$date":{"$numberLong":"1790989082679"}},"Expiry":{"$date":{"$numberLong":"1790992895934"}},"Node":"SolNode718","MissionType":"MT_ALCHEMY","Modifier":"VoidT6"},
    {"_id":{"$oid":"6ac04d3e00c0d31e85470c1a"},"Region":19,"Seed":41148,"Activation":{"$date":{"$numberLong":"1790987582589"}},"Expiry":{"$date":{"$numberLong":"1790992687125"}},"Node":"SolNode747","MissionType":"MT_INTEL","Modifier":"VoidT5"}
  ],
  "VoidStorms": [
    {"_id":{"$oid":"6ac040d321a4c311adace7cc"},"Node":"CrewBattleNode534","Activation":{"$date":{"$numberLong":"1790986803355"}},"Expiry":{"$date":{"$numberLong":"1790992203355"}},"ActiveMissionTier":"VoidT2"},
    {"_id":{"$oid":"6ac040d321a4c311adace7cb"},"Node":"CrewBattleNode512","Activation":{"$date":{"$numberLong":"1790986803353"}},"Expiry":{"$date":{"$numberLong":"1790992203353"}},"ActiveMissionTier":"VoidT1"}
  ],
  "Sorties": [
    {"_id":{"$oid":"6abfd17e1aa7ec1cbc7dffbc"},"Activation":{"$date":{"$numberLong":"1790956800000"}},"Expiry":{"$date":{"$numberLong":"1791043200000"}},"Reward":"/Lotus/Types/Game/MissionDecks/SortieRewards","Seed":36864,"Boss":"SORTIE_BOSS_RUK","ExtraDrops":[],"Variants":[{"missionType":"MT_ASSAULT","modifierType":"SORTIE_MODIFIER_EXIMUS","node":"SolNode744","tileset":"GrineerFortressTileset"},{"missionType":"MT_INTEL","modifierType":"SORTIE_MODIFIER_PUNCTURE","node":"SolNode122","tileset":"GrineerOceanTileset"},{"missionType":"MT_ASSASSINATION","modifierType":"SORTIE_MODIFIER_HAZARD_FIRE","node":"SolNode32","tileset":"GrineerGalleonTileset"}],"Twitter":true}
  ],
  "LiteSorties": [
    {"_id":{"$oid":"6ab9aa7e9b74836a49c1c5dc"},"Activation":{"$date":{"$numberLong":"1790553600000"}},"Expiry":{"$date":{"$numberLong":"1791158400000"}},"Reward":"/Lotus/Types/Game/MissionDecks/ArchonSortieRewards","Seed":34830,"Boss":"SORTIE_BOSS_AMAR","Missions":[{"missionType":"MT_EXTERMINATION","node":"SolNode41"},{"missionType":"MT_ARTIFACT","node":"SolNode16"},{"missionType":"MT_ASSASSINATION","node":"SolNode99"}]}
  ],
  "SyndicateMissions": [
    {"_id":{"$oid":"6abfd4c65b9a8e4e517c61b2"},"Activation":{"$date":{"$numberLong":"1790956742467"}},"Expiry":{"$date":{"$numberLong":"1791043140000"}},"Tag":"ArbitersSyndicate","Seed":36864,"Nodes":["SolNode113","SolNode109","SolNode31","SettlementNode2","SolNode1","SolNode72","SolNode140"]},
    {"_id":{"$oid":"6abfd4c65b9a8e4e517c61b6"},"Activation":{"$date":{"$numberLong":"1790956742467"}},"Expiry":{"$date":{"$numberLong":"1791043140000"}},"Tag":"KahlSyndicate","Seed":59182,"Nodes":[]},
    {"_id":{"$oid":"6abfd4c65b9a8e4e517c61c3"},"Activation":{"$date":{"$numberLong":"1790956742467"}},"Expiry":{"$date":{"$numberLong":"1791043140000"}},"Tag":"RadioLegionIntermission16Syndicate","Seed":55306,"Nodes":[]},
    {"_id":{"$oid":"6ac042380000000000000002"},"Activation":{"$date":{"$numberLong":"1790984760743"}},"Expiry":{"$date":{"$numberLong":"1790993759617"}},"Tag":"EntratiSyndicate","Seed":1410,"Nodes":[],"Jobs":[{"jobType":"/Lotus/Types/Gameplay/InfestedMicroplanet/Jobs/DeimosGrnSurvivorBounty","rewards":"/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/TierCTableCRewards","masteryReq":1,"minEnemyLevel":15,"maxEnemyLevel":25,"xpAmounts":[10,10,10]},{"rewards":"/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/VaultBountyTierATableBRewards","masteryReq":5,"minEnemyLevel":30,"maxEnemyLevel":40,"xpAmounts":[2,2,2,4],"locationTag":"ChamberB","isVault":true}]},
    {"_id":{"$oid":"6ac042380000000000000010"},"Activation":{"$date":{"$numberLong":"1790984760743"}},"Expiry":{"$date":{"$numberLong":"1790993759617"}},"Tag":"CetusSyndicate","Seed":1410,"Nodes":[],"Jobs":[{"jobType":"/Lotus/Types/Gameplay/Eidolon/Jobs/RescueBountyResc","rewards":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierATableCRewards","masteryReq":0,"minEnemyLevel":5,"maxEnemyLevel":15,"xpAmounts":[400,400,400]},{"jobType":"/Lotus/Types/Gameplay/Eidolon/Jobs/CaptureBountyCapTwo","rewards":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierETableCRewards","masteryReq":10,"minEnemyLevel":100,"maxEnemyLevel":100,"xpAmounts":[840,840,840,840,1660]},{"jobType":"/Lotus/Types/Gameplay/Eidolon/Jobs/Narmer/AttritionBountyLib","rewards":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/NarmerTableCRewards","masteryReq":0,"minEnemyLevel":50,"maxEnemyLevel":70,"xpAmounts":[780,780,780,780,1530]}]}
  ],
  "Invasions": [
    {"_id":{"$oid":"6abfb307a0febc86d023bfdf"},"Faction":"FC_CORPUS","DefenderFaction":"FC_GRINEER","Node":"SolNode184","Count":14382,"Goal":39000,"LocTag":"/Lotus/Language/Menu/CorpusInvasionGeneric","Completed":false,"ChainID":{"$oid":"6abbcc963651729086e46ba5"},"AttackerReward":{"countedItems":[{"ItemType":"/Lotus/Types/Recipes/Weapons/SnipetronVandalBlueprint","ItemCount":1}]},"AttackerMissionInfo":{"seed":153197,"faction":"FC_GRINEER"},"DefenderReward":{"countedItems":[{"ItemType":"/Lotus/Types/Recipes/Weapons/WeaponParts/GrineerCombatKnifeHeatsink","ItemCount":1}]},"DefenderMissionInfo":{"seed":104745,"faction":"FC_CORPUS"},"Activation":{"$date":{"$numberLong":"1790948617636"}}},
    {"_id":{"$oid":"6abf1bdb776f989486719539"},"Faction":"FC_INFESTATION","DefenderFaction":"FC_GRINEER","Node":"SolNode32","Count":-27976,"Goal":30000,"LocTag":"/Lotus/Language/Menu/InfestedInvasionBoss","Completed":false,"ChainID":{"$oid":"6abef65a213e093029c9e40a"},"AttackerReward":[],"AttackerMissionInfo":{"seed":834053,"faction":"FC_GRINEER"},"DefenderReward":{"countedItems":[{"ItemType":"/Lotus/Types/Items/Research/ChemComponent","ItemCount":3}]},"DefenderMissionInfo":{"seed":742905,"faction":"FC_INFESTATION","missionReward":[]},"Activation":{"$date":{"$numberLong":"1790909402499"}}}
  ],
  "Alerts": [
    {"_id":{"$oid":"6abdec7a31ca47b57807bccd"},"Activation":{"$date":{"$numberLong":"1790863200000"}},"Expiry":{"$date":{"$numberLong":"1792087200000"}},"MissionInfo":{"location":"SolNode87","missionType":"MT_ARTIFACT","faction":"FC_CORPUS","difficulty":1,"missionReward":{"credits":10000,"items":["/Lotus/StoreItems/Types/Items/ShipDecos/Plushies/Plushy2021QTCC"]},"levelOverride":"/Lotus/Levels/Proc/Corpus/CorpusGasCityDisruption","enemySpec":"/Lotus/Types/Game/EnemySpecs/CorpusAmalgamEndless","extraEnemySpec":"/Lotus/Types/Game/EnemySpecs/SpecialMissionSpecs/DisruptionCorpusAmalgams","minEnemyLevel":20,"maxEnemyLevel":30,"descText":"/Lotus/Language/Alerts/TennoUnitedAlert","maxWaveNum":8},"Tag":"LotusGift","ForceUnlock":true}
  ],
  "VoidTraders": [
    {"_id":{"$oid":"5d1e07a0a38e4a4fdd7cefca"},"Activation":{"$date":{"$numberLong":"1790946000000"}},"Expiry":{"$date":{"$numberLong":"1791118800000"}},"Character":"Baro'Ki Teel","Node":"SaturnHUB","Manifest":[{"ItemType":"/Lotus/StoreItems/Upgrades/Skins/Weapons/Pistols/ZylokExilisSkin","PrimePrice":300,"RegularPrice":420000},{"ItemType":"/Lotus/StoreItems/Upgrades/Mods/Rifle/Expert/WeaponFreezeDamageModExpert","PrimePrice":350,"RegularPrice":110000},{"ItemType":"/Lotus/StoreItems/Upgrades/Mods/Shotgun/DualStat/FireEventShotgunMod","PrimePrice":300,"RegularPrice":150000}]}
  ],
  "DailyDeals": [
    {"StoreItem":"/Lotus/StoreItems/Weapons/Corpus/Pistols/CorpusMinigun/CorpusMinigun","Activation":{"$date":{"$numberLong":"1790967600000"}},"Expiry":{"$date":{"$numberLong":"1791061200000"}},"Discount":70,"OriginalPrice":175,"SalePrice":52,"AmountTotal":60,"AmountSold":16}
  ],
  "SeasonInfo": {"Activation":{"$date":{"$numberLong":"1786548600000"}},"Expiry":{"$date":{"$numberLong":"1804464000000"}},"AffiliationTag":"RadioLegionIntermission16Syndicate","Season":18,"Phase":0,"Params":"","ActiveChallenges":[{"_id":{"$oid":"001900080000000000000109"},"Daily":true,"Activation":{"$date":{"$numberLong":"1790812800000"}},"Expiry":{"$date":{"$numberLong":"1791072000000"}},"Challenge":"/Lotus/Types/Challenges/Seasons/Daily/SeasonDailyKillEnemiesWithFire"},{"_id":{"$oid":"001900080000000000000099"},"Activation":{"$date":{"$numberLong":"1790553600000"}},"Expiry":{"$date":{"$numberLong":"1791158400000"}},"Challenge":"/Lotus/Types/Challenges/Seasons/Weekly/SeasonWeeklyPermanentCompleteMissions8"},{"_id":{"$oid":"001900080000000000000104"},"Activation":{"$date":{"$numberLong":"1790553600000"}},"Expiry":{"$date":{"$numberLong":"1791158400000"}},"Challenge":"/Lotus/Types/Challenges/Seasons/WeeklyHard/SeasonWeeklyHardTerminated","HasPrerequisites":true}]}
};

export const WFS = {
  "timestamp": "2026-10-03T01:21:29.000Z",
  "fissures": [
    {"id":"6ac042ee17a0328c56f18d62","activation":"2026-10-02T23:49:02.904Z","expiry":"2026-10-03T01:29:25.284Z","node":"Oceanum (Pluto)","missionType":"Spy","missionTypeKey":"Spy","enemy":"Corpus","enemyKey":"Corpus","nodeKey":"Oceanum (Pluto)","tier":"Axi","tierNum":4,"isStorm":false,"isHard":false},
    {"id":"6ac043a2d70b134405efac8e","activation":"2026-10-02T23:52:02.634Z","expiry":"2026-10-03T01:29:18.119Z","node":"Brugia (Eris)","missionType":"Rescue","missionTypeKey":"Rescue","enemy":"Infested","enemyKey":"Infested","nodeKey":"Brugia (Eris)","tier":"Axi","tierNum":4,"isStorm":false,"isHard":true},
    {"id":"6ac049439487466d1afc584e","activation":"2026-10-03T00:16:03.086Z","expiry":"2026-10-03T01:35:31.577Z","node":"Everview Arc (Zariman)","missionType":"Void Flood","missionTypeKey":"Void Flood","enemy":"Crossfire","enemyKey":"Crossfire","nodeKey":"Everview Arc (Zariman)","tier":"Omnia","tierNum":6,"isStorm":false,"isHard":true},
    {"id":"6ac04d3e00c0d31e85470c1a","activation":"2026-10-03T00:33:02.589Z","expiry":"2026-10-03T01:58:07.125Z","node":"Pago (Kuva Fortress)","missionType":"Spy","missionTypeKey":"Spy","enemy":"Grineer","enemyKey":"Grineer","nodeKey":"Pago (Kuva Fortress)","tier":"Requiem","tierNum":5,"isStorm":false,"isHard":false},
    {"id":"6ac0531a3f901a7119dec52a","activation":"2026-10-03T00:58:02.679Z","expiry":"2026-10-03T02:01:35.934Z","node":"Cambire (Deimos)","missionType":"Alchemy","missionTypeKey":"Alchemy","enemy":"The Murmur","enemyKey":"The Murmur","nodeKey":"Cambire (Deimos)","tier":"Omnia","tierNum":6,"isStorm":false,"isHard":false},
    {"id":"6ac040d321a4c311adace7cc","activation":"2026-10-03T00:20:03.355Z","expiry":"2026-10-03T01:50:03.355Z","node":"Lupal Pass (Saturn)","missionType":"Skirmish","missionTypeKey":"Skirmish","enemy":"Grineer","enemyKey":"Grineer","nodeKey":"Lupal Pass (Saturn)","tier":"Meso","tierNum":2,"isStorm":true,"isHard":false},
    {"id":"6ac040d321a4c311adace7cb","activation":"2026-10-03T00:20:03.353Z","expiry":"2026-10-03T01:50:03.353Z","node":"Orvin-Haarc (Venus)","missionType":"Spy","missionTypeKey":"Spy","enemy":"Corpus","enemyKey":"Corpus","nodeKey":"Orvin-Haarc (Venus)","tier":"Lith","tierNum":1,"isStorm":true,"isHard":false}
  ],
  "sortie": {"id":"6abfd17e1aa7ec1cbc7dffbc","activation":"2026-10-02T16:00:00.000Z","expiry":"2026-10-03T16:00:00.000Z","rewardPool":"Sortie Rewards","variants":[{"missionType":"Assault","missionTypeKey":"Assault","modifier":"Eximus Stronghold","modifierDescription":"Eximus units have a much higher spawn rate in this mission. Some of their auras stack.","node":"Taveuni (Kuva Fortress)","nodeKey":"Taveuni (Kuva Fortress)"},{"missionType":"Spy","missionTypeKey":"Spy","modifier":"Enemy Physical Enhancement: Puncture","modifierDescription":"Enemies can deal enhanced puncture damage. Finishing damage is not resisted.","node":"Stephano (Uranus)","nodeKey":"Stephano (Uranus)"},{"missionType":"Assassination","missionTypeKey":"Assassination","modifier":"Environmental Hazard: Fire","modifierDescription":"The tileset has a fire hazard. Warframe health is halved. Meltdown Iminent.","node":"Tethys (Saturn)","nodeKey":"Tethys (Saturn)"}],"missions":[],"boss":"General Sargas Ruk","faction":"Grineer","factionKey":"Grineer"},
  "archonHunt": {"id":"6ab9aa7e9b74836a49c1c5dc","activation":"2026-09-28T00:00:00.000Z","expiry":"2026-10-05T00:00:00.000Z","rewardPool":"Archon Sortie Rewards","variants":[],"missions":[{"node":"Arval (Mars)","nodeKey":"Arval (Mars)","type":"Extermination","typeKey":"Extermination"},{"node":"Augustus (Mars)","nodeKey":"Augustus (Mars)","type":"Disruption","typeKey":"Disruption"},{"node":"War (Mars)","nodeKey":"War (Mars)","type":"Assassination","typeKey":"Assassination"}],"boss":"Archon Amar","faction":"Narmer","factionKey":"Narmer"},
  "syndicateMissions": [
    {"id":"1790993759617CetusSyndicate","activation":"2026-10-02T23:46:00.743Z","expiry":"2026-10-03T02:15:59.617Z","syndicate":"Ostrons","syndicateKey":"Ostrons","nodes":[],"jobs":[{"id":"RescueBountyResc1790993759617","expiry":"2026-10-03T02:15:59.617Z","uniqueName":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierATableCRewards","type":"Search and Rescue","enemyLevels":[5,15],"standingStages":[400,400,400],"minMR":0},{"id":"CaptureBountyCapTwo1790993759617","expiry":"2026-10-03T02:15:59.617Z","uniqueName":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierETableCRewards","type":"Spy Catcher","enemyLevels":[100,100],"standingStages":[840,840,840,840,1660],"minMR":10},{"id":"AttritionBountyLib1790993759617","expiry":"2026-10-03T01:25:59.617Z","uniqueName":"/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/NarmerTableCRewards","type":"Bring Them Home (Narmer)","enemyLevels":[50,70],"standingStages":[780,780,780,780,1530],"minMR":0,"timeBound":"day"}]},
    {"id":"1790993759617EntratiSyndicate","activation":"2026-10-02T23:46:00.743Z","expiry":"2026-10-03T02:15:59.617Z","syndicate":"Entrati","syndicateKey":"Entrati","nodes":[],"jobs":[{"id":"DeimosGrnSurvivorBounty1790993759617","expiry":"2026-10-03T02:15:59.617Z","uniqueName":"/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/TierCTableCRewards","type":"Brute Force","enemyLevels":[15,25],"standingStages":[10,10,10],"minMR":1},{"id":"1790993759617","expiry":"2026-10-03T02:15:59.617Z","uniqueName":"/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/VaultBountyTierATableBRewards","type":"Isolation Vault Chamber B","enemyLevels":[30,40],"standingStages":[2,2,2,4],"minMR":5,"isVault":true,"locationTag":"ChamberB"}]},
    {"id":"1791043140000ArbitersSyndicate","activation":"2026-10-02T15:59:02.467Z","expiry":"2026-10-03T15:59:00.000Z","syndicate":"Arbiters of Hexis","syndicateKey":"Arbiters of Hexis","nodes":["Ares (Mars)","Linea (Venus)","Anthe (Saturn)","Skyresh (Phobos)","Galatea (Neptune)","Outer Terminus (Pluto)","Kiste (Ceres)"],"jobs":[]},
    {"id":"1791043140000KahlSyndicate","activation":"2026-10-02T15:59:02.467Z","expiry":"2026-10-03T15:59:00.000Z","syndicate":"Kahl's Garrison","syndicateKey":"Kahl's Garrison","nodes":[],"jobs":[]},
    {"id":"1791043140000RadioLegionIntermission16Syndicate","activation":"2026-10-02T15:59:02.467Z","expiry":"2026-10-03T15:59:00.000Z","syndicate":"RadioLegionIntermission16Syndicate","syndicateKey":"RadioLegionIntermission16Syndicate","nodes":[],"jobs":[]}
  ],
  "invasions": [
    {"id":"6abfb307a0febc86d023bfdf","activation":"2026-10-02T13:43:37.636Z","node":"Rusalka (Sedna)","nodeKey":"Rusalka (Sedna)","desc":"Corpus Siege","attacker":{"reward":{"items":[],"countedItems":[{"uniqueName":"/Lotus/Types/Recipes/Weapons/SnipetronVandalBlueprint","type":"Snipetron Vandal Blueprint","key":"Snipetron Vandal Blueprint","count":1}],"credits":0,"thumbnail":"https://cdn.warframestat.us/img/dera-vandal.png","color":6052435},"faction":"Corpus","factionKey":"Corpus"},"defender":{"reward":{"items":[],"countedItems":[{"uniqueName":"/Lotus/Types/Recipes/Weapons/WeaponParts/GrineerCombatKnifeHeatsink","type":"Sheev Heatsink","key":"Sheev Heatsink","count":1}],"credits":0,"thumbnail":"","color":5198940},"faction":"Grineer","factionKey":"Grineer"},"vsInfestation":false,"count":14361,"requiredRuns":39000,"completion":68.41153846153847,"completed":false,"rewardTypes":["vandal","other"]},
    {"id":"6abf1bdb776f989486719539","activation":"2026-10-02T02:50:02.499Z","node":"Tethys (Saturn)","nodeKey":"Tethys (Saturn)","desc":"Phorid Manifestation","attacker":{"faction":"Infested","factionKey":"Infested"},"defender":{"reward":{"items":[],"countedItems":[{"uniqueName":"/Lotus/Types/Items/Research/ChemComponent","type":"Detonite Injector","key":"Detonite Injector","count":3}],"credits":0,"thumbnail":"https://cdn.warframestat.us/img/detonite-injector.png","color":5068118},"faction":"Grineer","factionKey":"Grineer"},"vsInfestation":true,"count":-27962,"requiredRuns":30000,"completion":6.7933333333333294,"completed":false,"rewardTypes":["detonite"]}
  ],
  "alerts": [
    {"id":"6abdec7a31ca47b57807bccd","activation":"2026-10-01T14:00:00.000Z","expiry":"2026-10-15T18:00:00.000Z","mission":{"description":"Tenno United Alert","node":"Ganymede (Jupiter)","nodeKey":"Ganymede (Jupiter)","type":"Disruption","typeKey":"Disruption","faction":"Corpus","factionKey":"Corpus","reward":{"items":["Conquera Kuaka Floof"],"countedItems":[{"uniqueName":"/Lotus/StoreItems/Types/Items/ShipDecos/Plushies/Plushy2021QTCC","type":"Conquera Kuaka Floof","key":"Conquera Kuaka Floof","count":1}],"credits":10000,"thumbnail":"","color":5198940},"minEnemyLevel":20,"maxEnemyLevel":30,"maxWaveNum":8},"rewardTypes":["other"],"tag":"LotusGift"}
  ],
  "voidTrader": {"id":"5d1e07a0a38e4a4fdd7cefca","activation":"2026-10-02T13:00:00.000Z","expiry":"2026-10-04T13:00:00.000Z","character":"Baro Ki'Teer","location":"Kronia Relay (Saturn)","inventory":[{"uniqueName":"/Lotus/StoreItems/Upgrades/Skins/Weapons/Pistols/ZylokExilisSkin","item":"Zylok Exilis Skin","ducats":300,"credits":420000},{"uniqueName":"/Lotus/StoreItems/Upgrades/Mods/Rifle/Expert/WeaponFreezeDamageModExpert","item":"Primed Cryo Rounds","ducats":350,"credits":110000},{"uniqueName":"/Lotus/StoreItems/Upgrades/Mods/Shotgun/DualStat/FireEventShotgunMod","item":"Scattering Inferno","ducats":300,"credits":150000}],"psId":"5d1e07a0a38e4a4fdd7cefca38","initialStart":"1970-01-01T00:00:00.000Z","schedule":[]},
  "dailyDeals": [
    {"id":"CorpusMinigun1791061200000","activation":"2026-10-02T19:00:00.000Z","expiry":"2026-10-03T21:00:00.000Z","item":"Cestra","uniqueName":"/Lotus/StoreItems/Weapons/Corpus/Pistols/CorpusMinigun/CorpusMinigun","originalPrice":175,"salePrice":52,"total":60,"sold":16,"discount":70}
  ],
  "nightwave": {"id":"nightwave1804464000000","activation":"2026-08-12T15:30:00.000Z","expiry":"2027-03-08T00:00:00.000Z","season":18,"tag":"Radio Legion Intermission16 Syndicate","phase":0,"activeChallenges":[{"id":"1791072000000seasondailykillenemieswithfire","activation":"2026-10-01T00:00:00.000Z","expiry":"2026-10-04T00:00:00.000Z","isDaily":true,"isElite":false,"desc":"Kill 150 Enemies with Heat Damage","title":"Arsonist","reputation":1000,"isPermanent":false},{"id":"1791158400000seasonweeklypermanentcompletemissions8","activation":"2026-09-28T00:00:00.000Z","expiry":"2026-10-05T00:00:00.000Z","isDaily":false,"isElite":false,"desc":"Complete any 15 missions","title":"Mission Complete VIII","reputation":4500,"isPermanent":false},{"id":"1791158400000seasonweeklyhardterminated","activation":"2026-09-28T00:00:00.000Z","expiry":"2026-10-05T00:00:00.000Z","isDaily":false,"isElite":true,"desc":"Destroy 3 Necramech vault guardians","title":"Terminated","reputation":7000,"isPermanent":false}]}
};

export const KNOTEN = {
  "CrewBattleNode512": {"value":"Orvin-Haarc (Venus)","enemy":"Corpus","type":"Spy"},
  "CrewBattleNode534": {"value":"Lupal Pass (Saturn)","enemy":"Grineer","type":"Skirmish"},
  "SaturnHUB": {"value":"Kronia Relay (Saturn)","enemy":"Grineer","type":"Relay"},
  "SettlementNode2": {"value":"Skyresh (Phobos)","enemy":"Corpus","type":"Capture"},
  "SolNode1": {"value":"Galatea (Neptune)","enemy":"Corpus","type":"Capture"},
  "SolNode102": {"value":"Oceanum (Pluto)","enemy":"Corpus","type":"Spy"},
  "SolNode109": {"value":"Linea (Venus)","enemy":"Corpus","type":"Rescue"},
  "SolNode113": {"value":"Ares (Mars)","enemy":"Grineer","type":"Sabotage"},
  "SolNode122": {"value":"Stephano (Uranus)","enemy":"Grineer","type":"Defense"},
  "SolNode140": {"value":"Kiste (Ceres)","enemy":"Grineer","type":"Mobile Defense"},
  "SolNode153": {"value":"Brugia (Eris)","enemy":"Infested","type":"Rescue"},
  "SolNode16": {"value":"Augustus (Mars)","enemy":"Grineer","type":"Excavation"},
  "SolNode184": {"value":"Rusalka (Sedna)","enemy":"Grineer","type":"Sabotage"},
  "SolNode230": {"value":"Everview Arc (Zariman)","enemy":"Crossfire","type":"Void Flood"},
  "SolNode31": {"value":"Anthe (Saturn)","enemy":"Grineer","type":"Rescue"},
  "SolNode32": {"value":"Tethys (Saturn)","enemy":"Grineer","type":"Assassination"},
  "SolNode41": {"value":"Arval (Mars)","enemy":"Grineer","type":"Spy"},
  "SolNode718": {"value":"Cambire (Deimos)","enemy":"The Murmur","type":"Alchemy"},
  "SolNode72": {"value":"Outer Terminus (Pluto)","enemy":"Corpus","type":"Defense"},
  "SolNode744": {"value":"Taveuni (Kuva Fortress)","enemy":"Grineer","type":"Survival"},
  "SolNode747": {"value":"Pago (Kuva Fortress)","enemy":"Grineer","type":"Spy"},
  "SolNode87": {"value":"Ganymede (Jupiter)","enemy":"Corpus","type":"Disruption"},
  "SolNode99": {"value":"War (Mars)","enemy":"Grineer","type":"Assassination"}
};
