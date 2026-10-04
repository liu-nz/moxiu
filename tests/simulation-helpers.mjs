import { createInitialState } from '../src/core/state.js';
import { ensureDay } from '../src/systems/rift.js';
export function seed(n) { return () => {n=(n*1664525+1013904223)>>>0;return n/4294967296;}; }
export function fixed(rng,fn) {const old=Math.random;try{Math.random=rng;return fn();}finally{Math.random=old;}}
export function fresh(stage=0,side='cultivation') {const s=createInitialState(Date.parse('2026-10-01T22:00:00Z'));s.player.stage=stage;s.side=side;ensureDay(s,{silent:true});return s;}
