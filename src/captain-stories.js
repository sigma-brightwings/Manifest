/* captain-stories.js — the stories on the title card.
 *
 * (Was captains.js until the 2026-10-25 merge with the Shared_AI line,
 * whose captains.js is the captains out there in their ships. Astra: those
 * keep the name; these became CaptainStories.)
 *
 * The box under the main menu tells one captain's story: where they began
 * and how they reached the top. A different one every time the game starts,
 * never the same one twice running. They are not instructions and not a
 * tutorial. Each is a road someone else took through this galaxy, told
 * plainly, so the player can see that the road is open to them too.
 *
 * Every one of them is something the game lets you do: hauling, milfuel,
 * skimming, survey and claims, mining, salvage, passengers, couriers,
 * bounties, contraband, rescue, a fleet and its crews, holdings, markets,
 * wars. Keep it that way when adding more: no story about a thing the game
 * cannot do. Each must fit the box: 420 characters at most (the test holds
 * that).
 */
(function (global) {
  'use strict';

  var LIST = [
    { name: 'Captain Imre Vasko',
      text: 'Vasko started with a borrowed hauler and a debt to the yard that built it. ' +
            'For two years he ran milfuel to the same three stations, learned which ' +
            'prices lied, and never once missed a delivery. The debt was paid in the ' +
            'third year. By the tenth, Vasko owned the yard.' },
    { name: 'Captain Nadia Okafor',
      text: 'Okafor\'s first ship was a wreck nobody else wanted: a courier holed by ' +
            'pirates, tumbling in a Trojan cloud. She patched it herself and flew it ' +
            'home on one engine. Twelve years on, her rescue ships answer distress ' +
            'calls across four systems, and still take nothing from the stranded.' },
    { name: 'Captain Teodor Lind',
      text: 'Lind spent his savings on a survey scanner and his first year in polar ' +
            'orbits, mapping worlds nobody else had bothered with. Most were dust. One ' +
            'was not. The claim he filed on a ringed moon is now the richest mine on ' +
            'the lane, and Lind still flies the survey runs himself.' },
    { name: 'Captain Mae Harrow',
      text: 'Harrow skimmed fuel off gas giants when the margins were thin and the ' +
            'dives were deep. She learned exactly how low a hull could go and still ' +
            'come back. When the war closed the lanes, hers was the only fuel still ' +
            'moving. After the war, half the frontier bought from her.' },
    { name: 'Captain Rafi Sorensen',
      text: 'Sorensen flew cargo because cargo does not talk back. Then he took one ' +
            'passenger, a broker who talked for six jumps straight, and by the last ' +
            'jump they were partners. Their liners run the busiest lane in the sector ' +
            'now. Sorensen still takes the night watch.' },
    { name: 'Captain Yusra Bell',
      text: 'Bell turned down her first bounty, and her second. The third pirate had ' +
            'taken her brother\'s freighter. She tracked it across three systems and ' +
            'brought it in without killing anyone aboard, and found she was good at ' +
            'it. The Syndicate pays her to keep its lanes quiet now.' },
    { name: 'Captain Okon Pryce',
      text: 'Pryce ran contraband for five years and was never boarded. The day he ' +
            'finally was, he had nothing in the hold but grain. He took that as a ' +
            'warning. He went straight, bought a refinery with what he had put by, ' +
            'and now buys honest ore at an honest price, and pays on time.' },
    { name: 'Captain Lena Marsh',
      text: 'Marsh flew alone for six years. Her first hire was a pilot every other ' +
            'captain had let go for being slow. Marsh noticed his cargo always ' +
            'arrived whole. Thirty ships later she still hires for care over speed, ' +
            'and her fleet has not lost a load in a decade.' },
    { name: 'Captain Ada Kowalczyk',
      text: 'Kowalczyk lived out of wrecks: stripping drives, selling hull plate, ' +
            'sleeping in whichever cabin still held air. The scavengers called the ' +
            'patch she worked a graveyard. She called it a port, and kept bolting ' +
            'pieces on until traders docked there. It is on the charts now.' },
    { name: 'Captain Joon Ha',
      text: 'Ha mined a belt with a laser rated for half the work, eleven seconds a ' +
            'chunk, for four years. She knew every rock by its tumble. When the big ' +
            'outfits came with their rigs, they hired her to tell them where to ' +
            'point. She charged them by the hour, and bought the belt.' },
    { name: 'Captain Tomas Ruel',
      text: 'Ruel never had the fastest ship. He had a notebook: every price, every ' +
            'port, every week, for nine years. He saw the shortage coming three ' +
            'systems out and filled his hold before anyone noticed. He has never ' +
            'said how he knew. The notebook is on his bridge, under glass.' },
    { name: 'Captain Sela Moreau',
      text: 'Moreau took the courier jobs nobody wanted: tight windows, long jumps, ' +
            'cargo that would not say what it was. She learned the lane timetables ' +
            'by heart and never missed a window. When the Portbuilders\' Union needed ' +
            'plans carried across a war line, they asked for her by name.' }
  ];

  var KEY = 'manifest.lastCaptain';
  var MAX_CHARS = 420;

  /* A different story from last time. `rand` is for the tests; the game
   * uses Math.random, because this is the one thing on the title card that
   * is meant to change. The last pick is remembered in localStorage when
   * there is one, and forgotten harmlessly when there is not. */
  function pick(rand) {
    rand = rand || Math.random;
    var last = -1;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var v = parseInt(localStorage.getItem(KEY), 10);
        if (v >= 0 && v < LIST.length) last = v;
      }
    } catch (e) { /* no storage: any story will do */ }
    var i = Math.floor(rand() * (LIST.length - (last >= 0 ? 1 : 0)));
    if (last >= 0 && i >= last) i++;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(KEY, String(i));
    } catch (e) { /* ignore */ }
    return { index: i, name: LIST[i].name, text: LIST[i].text };
  }

  var CaptainStories = { LIST: LIST, MAX_CHARS: MAX_CHARS, pick: pick };
  global.CaptainStories = CaptainStories;
  if (typeof module !== 'undefined' && module.exports) module.exports = CaptainStories;
})(typeof window !== 'undefined' ? window : globalThis);
