import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMatch } from '../../web/core.mjs';
import { selectedReference } from '../../web/cricclubs-reference.mjs';
import { createFeed } from '../../web/feed.mjs';
import { parseScrapeArgs } from '../../scripts/scrape-cricclubs.mjs';
import { ScoreService } from '../lib/score.mjs';
import { parseCricClubsScorecard } from '../lib/cricclubs.mjs';
const references=[{clubId:'1507',matchId:'3866',league:'TampaCricket'},{clubId:'157',matchId:'6098',league:'TCL'}];
const url=ref=>`https://cricclubs.com/${ref.league}/viewScorecard.do?matchId=${ref.matchId}&clubId=${ref.clubId}`;
const html=fs.readFileSync(new URL('./fixtures/scorecard-layout.html',import.meta.url),'utf8');
const document=ref=>({...parseCricClubsScorecard(html.replaceAll('TestLeague',ref.league).replaceAll('matchId=456',`matchId=${ref.matchId}`).replaceAll('clubId=123',`clubId=${ref.clubId}`).replace('name="matchId" value="456"',`name="matchId" value="${ref.matchId}"`).replace('name="clubId" value="123"',`name="clubId" value="${ref.clubId}"`),ref),fetchedAt:Date.now()});
const ticker=ref=>({view:1,isSecondInningsStarted:true,values:{clubId:ref.clubId,matchId:ref.matchId,t1Name:'Alpha CC',t2Name:'Beta CC',t1Total:'150',t1Wickets:'3',t1Overs:'20',t2Total:'151',t2Wickets:'2',t2Overs:'19.2',isMatchEnded:'1'}});

test('both supplied URLs preserve exact league path, Club ID and Match ID',()=>{
  for(const ref of references)assert.deepEqual(parseMatch(url(ref),'300','FWCWL'),ref);
  assert.deepEqual(parseMatch('3867','1507','TampaCricket'),{clubId:'1507',matchId:'3867',league:'TampaCricket'});
});
test('match references reject write routes, repeated IDs, hostile league paths and extra query parameters',()=>{
  for(const value of [
    'https://cricclubs.com/TCL/matchOverlayConfig.do?matchId=6098&clubId=157',
    url(references[0])+'&matchId=1',url(references[0])+'&redirect=https://evil.test',
    'https://cricclubs.com/TCL/viewScorecard.do?matchId=6098',
    'https://cricclubs.com/TCL/viewScorecard.do?matchId=6098&clubId=157#private',
    'https://cricclubs.com:444/TCL/viewScorecard.do?matchId=6098&clubId=157'
  ])assert.throws(()=>parseMatch(value,'300'));
  for(const league of ['../TCL','TCL/viewScorecard.do','https://evil.test','A?x=1',{},['TCL']])assert.throws(()=>selectedReference({...references[0],league}));
});
test('relay scraper uses each preset league for bare IDs and dynamic later matches',async()=>{
  const calls=[];
  const service=new ScoreService({fetchFn:async rawUrl=>{const u=new URL(rawUrl);return new Response(JSON.stringify(ticker({clubId:u.searchParams.get('clubId'),matchId:u.searchParams.get('matchId')})));},scorecardScraper:{scrape:async ref=>{calls.push(ref);return document(ref);}}});
  for(const ref of [...references,{...references[0],matchId:'3867'}]){
    service.select(ref.clubId,ref.matchId);await service.refresh();await service.scorecardTask;
    assert.deepEqual(calls.at(-1),ref);assert.equal(service.snapshot().league,ref.league);
    assert.equal(service.snapshot().score.matchId,ref.matchId);assert.equal(service.snapshot().score.cards.complete,true);
    assert.equal(service.snapshot().score.inningsCards.length,2);
  }
});
test('full URL league survives direct preview, cloud connection, polling and another selection',async()=>{
  let relay=null;const bodies=[];
  const feed=createFeed({auto:false,fetchFn:async u=>{const params=new URL(u).searchParams;return new Response(JSON.stringify(ticker({clubId:params.get('clubId'),matchId:params.get('matchId')})));},getRelay:()=>relay});
  await feed.select(parseMatch(url(references[0])));
  assert.deepEqual(feed.ids,references[0]);
  relay={session:'fixture-session',request:async(route,options)=>{if(options?.body)bodies.push(JSON.parse(options.body));const ref=bodies.at(-1);return {ids:{clubId:ref.clubId,matchId:ref.matchId},score:{clubId:ref.clubId,matchId:ref.matchId},league:ref.league};}};
  await feed.changeSource();await feed.refresh();assert.deepEqual(bodies,[references[0]]);
  await feed.select(parseMatch(url(references[1])));assert.deepEqual(bodies,[references[0],references[1]]);feed.stop();
});
test('a full URL supports an unknown league without changing server environment',async()=>{
  let requested;const ref={clubId:'999',matchId:'1234',league:'AnotherLeague'};
  const service=new ScoreService({fetchFn:async()=>new Response(JSON.stringify(ticker(ref))),scorecardScraper:{scrape:async value=>{requested=value;return document(value);}}});
  const parsed=parseMatch(url(ref));service.select(parsed.clubId,parsed.matchId,parsed.league);await service.refresh();await service.scorecardTask;
  assert.deepEqual(requested,ref);assert.equal(service.snapshot().score.cards.complete,true);
});
test('late HTML from another league or old path cannot enrich the new selection',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const service=new ScoreService({fetchFn:async u=>{const params=new URL(u).searchParams;return new Response(JSON.stringify(ticker({clubId:params.get('clubId'),matchId:params.get('matchId')})));},scorecardScraper:{scrape:async ref=>{if(ref.clubId==='1507')await pending;return document(ref);}}});
  service.select('1507','3866');await service.refresh();const old=service.scorecardTask;
  service.select('157','6098');assert.equal(service.snapshot().score,null);await service.refresh();await service.scorecardTask;
  release();await old;assert.equal(service.snapshot().score.clubId,'157');assert.equal(service.scorecardDocument.clubId,'157');assert.equal(service.league,'TCL');
  service.select('157','6098','NewAlias');assert.equal(service.snapshot().score,null);assert.equal(service.scorecardDocument,null);
});
test('CLI resolves both league presets for numeric club/match input',()=>{
  for(const ref of references){const args=parseScrapeArgs(['--club',ref.clubId,'--match',ref.matchId]);assert.equal(args.ref.league,ref.league);assert.equal(args.ref.url,url(ref));}
  assert.throws(()=>parseScrapeArgs(['--club','999','--match','1234']));
});
test('captured normalized ticker totals for both real sample matches remain incomplete and completed',()=>{
  for(const [file,club,match,teams] of [
    ['tampa-3866-normalized.json','1507','3866',[['Jaguars','130','5'],['Roaring Royals','95','5']]],
    ['tcl-6098-normalized.json','157','6098',[['Kings','138','7'],['NewTampaHawks','79','7']]]
  ]){const value=JSON.parse(fs.readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));assert.equal(value.clubId,club);assert.equal(value.matchId,match);assert.equal(value.status,'complete');assert.equal(value.cards.complete,false);assert.deepEqual(value.commentary,[]);assert.deepEqual(value.teams.map(t=>[t.name,t.runs,t.wickets]),teams);}
});
