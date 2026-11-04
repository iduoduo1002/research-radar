'use strict';
const fs=require('node:fs'),{normalizeSettings,DEFAULT_SETTINGS,mergeProfile,profile,describeChange}=require('../src/config');
try{const p=process.argv[2];if(!p)throw Error('Usage: node scripts/validate-profile.cjs profile.json');const base=normalizeSettings(DEFAULT_SETTINGS),next=mergeProfile(fs.readFileSync(p,'utf8'),base);console.log(JSON.stringify({valid:true,changes:describeChange(base,next),profile:profile(next)},null,2));}catch(e){console.error(e.message);process.exitCode=1;}
