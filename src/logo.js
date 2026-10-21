/* logo.js — the Manifest wordmark and the compass rose.
 *
 * TWO PIECES OF ARTWORK, both as geometry rather than as pictures, for the
 * same reason everything else in this game is geometry: they have to be
 * right at any size, on a 1366x768 rugged laptop and on a 4K monitor, and
 * a PNG is right at exactly one.
 *
 * THE WORDMARK IS AN OUTLINE, NOT A FONT. It is "Manifest" set in Uncial
 * Antiqua (Astigmatic, SIL Open Font License), first letter capital,
 * tracked 0.03 em — chosen 21 October 2026 to suggest an epic voyage, in
 * place of the Segoe Script of Astra's original card (that outline is in
 * git history). Converted once to Bezier outlines by "Claude outputs/
 * wordmark.cjs" and pasted in below. That is what a logotype IS: a drawing
 * of some letters, not a request for a typeface at run time. As outlines it
 * is identical everywhere, needs no font file shipped, and scales without
 * a soft edge.
 *
 * Coordinates are in a box MARK_W wide by 1000 tall, y down, origin at the
 * top left of the ink — so a caller asks for a width and gets a height of
 * width / MARK_ASPECT for free.
 *
 * Each subpath below is a flat run of numbers: two to start (the moveTo),
 * then an opcode and its coordinates — 1 followed by two numbers is a line,
 * 3 followed by six is a cubic. Filled even-odd, which is what puts the
 * holes in the a and the e.
 */
(function (global) {
  'use strict';

  var MARK_W = 5979, MARK_H = 1000;

  var MARK = [
    [542,787,1,542,386,3,542,359,541,331,538,303,3,536,276,532,250,527,225,3,
     521,200,514,176,506,155,3,497,133,487,114,474,99,3,461,83,447,70,430,61,
     3,413,52,393,47,372,47,1,372,47,3,340,47,312,56,288,74,3,263,92,242,117,
     224,147,3,207,177,193,212,184,251,3,175,291,170,332,170,375,1,170,375,3,
     170,422,175,465,186,503,3,196,542,209,576,225,606,3,241,636,258,662,276,
     685,3,295,707,312,726,329,740,3,345,755,359,766,371,774,3,382,782,389,
     786,391,787,1,391,787,1,190,787,3,183,783,174,776,162,766,3,150,755,137,
     741,123,724,3,109,706,95,686,80,663,3,66,640,52,615,40,588,3,29,561,19,
     532,11,501,3,4,470,0,438,0,405,1,0,405,3,0,384,2,360,6,333,3,9,306,16,
     278,26,249,3,36,220,49,191,66,163,3,83,135,105,110,131,88,3,157,66,189,
     48,225,35,3,262,21,305,14,355,14,1,355,14,3,388,14,418,17,445,23,3,472,
     30,496,38,518,49,3,539,59,559,72,575,86,3,592,101,607,116,620,132,1,620,
     132,3,633,116,648,101,666,86,3,684,72,705,59,728,49,3,751,38,777,30,806,
     23,3,836,17,868,14,904,14,1,904,14,3,953,14,995,20,1032,30,3,1069,41,
     1101,56,1128,74,3,1156,93,1178,114,1196,138,3,1214,162,1229,187,1240,213,
     3,1251,239,1259,266,1263,292,3,1268,319,1270,344,1270,368,1,1270,368,3,
     1270,412,1263,452,1250,488,3,1237,525,1220,557,1199,586,3,1178,615,1154,
     641,1128,663,3,1102,686,1076,705,1050,721,3,1025,738,1001,751,979,762,3,
     956,772,939,781,925,787,1,925,787,1,879,787,3,880,786,887,782,899,774,3,
     910,766,924,754,941,739,3,957,724,975,705,993,683,3,1012,660,1029,633,
     1045,602,3,1060,571,1074,536,1084,497,3,1095,458,1100,415,1100,367,1,
     1100,367,3,1100,317,1094,273,1083,233,3,1071,194,1055,160,1036,133,3,
     1017,105,994,84,968,69,3,943,55,916,47,888,47,1,888,47,3,866,47,846,52,
     828,61,3,811,70,795,83,782,99,3,769,114,757,133,748,155,3,739,176,731,
     200,725,225,3,719,250,715,276,712,303,3,710,331,708,359,708,386,1,708,
     386,1,708,787,1,542,787],
    [1720,199,1,1720,199,3,1746,199,1770,202,1792,208,3,1814,213,1833,220,
     1850,228,3,1867,236,1882,245,1894,254,3,1907,263,1917,271,1924,279,1,
     1924,279,3,1935,270,1947,262,1959,256,3,1972,249,1985,243,1998,238,3,
     2011,233,2023,229,2036,227,3,2049,224,2061,222,2073,222,1,2073,222,1,
     2079,239,3,2065,245,2052,254,2041,266,1,2041,266,3,2032,277,2023,292,
     2015,311,3,2007,330,2003,355,2002,385,1,2002,385,3,2001,403,2001,422,
     2001,441,3,2001,460,2001,479,2001,498,3,2001,517,2001,535,2000,551,3,
     2000,568,2000,584,2000,597,3,2000,610,2000,621,2000,629,3,2000,638,2000,
     642,2000,644,1,2000,644,3,2000,674,2004,699,2012,718,3,2019,737,2028,752,
     2038,762,1,2038,762,3,2050,775,2063,784,2077,790,1,2077,790,1,2071,807,3,
     2053,806,2035,803,2015,798,3,1996,793,1977,786,1958,776,3,1940,767,1922,
     755,1907,742,3,1891,729,1878,714,1868,697,1,1868,697,3,1861,711,1852,724,
     1842,736,3,1831,749,1817,760,1802,770,3,1786,780,1767,788,1746,794,3,
     1725,800,1700,803,1672,803,1,1672,803,3,1627,803,1587,795,1552,779,3,
     1518,762,1489,741,1466,714,3,1443,688,1425,658,1414,625,3,1402,592,1396,
     558,1396,524,1,1396,524,3,1396,498,1399,473,1405,447,3,1411,421,1420,396,
     1432,372,3,1445,348,1460,325,1478,304,3,1496,283,1517,265,1541,249,3,
     1565,234,1592,221,1621,213,3,1651,204,1684,199,1720,199],
    [1722,748,1,1722,748,3,1746,748,1767,742,1783,731,3,1799,720,1812,706,
     1821,690,3,1831,674,1838,657,1843,639,3,1847,621,1850,605,1852,592,1,
     1852,592,1,1856,393,3,1856,385,1854,376,1852,366,3,1850,355,1847,344,
     1844,333,3,1840,322,1835,311,1829,299,3,1823,288,1815,278,1805,269,3,
     1796,260,1785,253,1771,248,3,1758,242,1743,239,1725,239,1,1725,239,3,
     1699,239,1675,246,1654,259,3,1633,272,1614,291,1599,313,3,1584,336,1573,
     363,1564,394,3,1556,424,1552,456,1552,491,1,1552,491,3,1552,536,1557,574,
     1566,606,3,1576,639,1589,665,1605,686,3,1621,707,1639,723,1659,733,3,
     1680,743,1700,748,1722,748],
    [2470,767,1,2470,787,1,2175,787,1,2175,767,3,2190,767,2202,766,2211,763,3,
     2220,760,2227,756,2233,751,3,2238,746,2242,740,2243,733,3,2245,727,2246,
     720,2246,713,1,2246,713,1,2246,294,3,2246,288,2245,283,2243,277,3,2242,
     271,2238,265,2233,260,3,2227,255,2220,251,2211,247,3,2202,244,2190,242,
     2175,242,1,2175,242,1,2175,222,1,2470,222,1,2470,242,3,2456,242,2445,244,
     2435,246,3,2426,249,2419,253,2413,257,3,2408,262,2404,267,2402,274,3,
     2400,280,2399,286,2399,293,1,2399,293,1,2399,426,3,2411,450,2426,476,
     2443,504,3,2460,531,2480,559,2503,586,3,2526,613,2553,640,2583,665,3,
     2612,690,2646,712,2683,732,1,2683,732,1,2683,297,3,2683,292,2682,286,
     2681,279,3,2679,273,2676,267,2671,261,3,2666,256,2658,251,2649,248,3,
     2640,244,2628,242,2612,242,1,2612,242,1,2612,222,1,2907,222,1,2907,242,3,
     2893,242,2881,244,2872,246,3,2863,249,2856,253,2850,257,3,2845,262,2841,
     267,2839,274,3,2837,280,2836,286,2836,293,1,2836,293,1,2836,716,3,2836,
     721,2837,727,2839,733,3,2841,738,2844,744,2850,749,3,2855,754,2862,758,
     2871,762,3,2880,765,2892,767,2907,767,1,2907,767,1,2907,787,1,2683,787,3,
     2657,780,2631,770,2605,755,3,2579,740,2553,722,2528,703,3,2504,684,2480,
     664,2458,643,3,2436,622,2416,603,2399,584,1,2399,584,1,2399,713,3,2399,
     718,2400,724,2401,730,3,2403,736,2407,742,2412,748,3,2417,753,2424,758,
     2433,761,3,2442,765,2455,767,2470,767,1,2470,767],
    [3297,767,1,3297,787,1,3001,787,1,3001,767,3,3016,767,3028,766,3037,763,3,
     3046,760,3054,756,3059,751,3,3064,746,3068,740,3070,733,3,3072,727,3073,
     720,3073,713,1,3073,713,1,3073,297,3,3073,292,3072,286,3070,279,3,3068,
     273,3065,267,3060,261,3,3055,256,3048,251,3038,248,3,3029,244,3017,242,
     3001,242,1,3001,242,1,3001,222,1,3297,222,1,3297,242,3,3283,242,3271,244,
     3262,246,3,3252,249,3245,253,3240,257,3,3234,262,3230,267,3228,274,3,
     3226,280,3225,286,3225,293,1,3225,293,1,3225,713,3,3225,718,3226,724,
     3228,730,3,3229,736,3233,742,3238,748,3,3243,753,3250,758,3259,761,3,
     3269,765,3281,767,3297,767,1,3297,767],
    [3068,82,1,3068,82,3,3068,71,3070,60,3075,50,3,3079,40,3085,32,3092,24,3,
     3099,17,3108,11,3118,7,3,3128,2,3139,0,3150,0,1,3150,0,3,3161,0,3172,2,
     3182,7,3,3192,11,3200,17,3208,24,3,3215,32,3221,40,3225,50,3,3230,60,
     3232,71,3232,82,1,3232,82,3,3232,93,3230,104,3225,114,3,3221,124,3215,
     132,3208,140,3,3200,147,3192,153,3182,157,3,3172,161,3161,163,3150,163,1,
     3150,163,3,3139,163,3128,161,3118,157,3,3108,153,3099,147,3092,140,3,
     3085,132,3079,124,3075,114,3,3070,104,3068,93,3068,82],
    [3680,981,1,3680,1000,1,3386,1000,1,3386,981,3,3400,981,3412,979,3422,976,
     3,3431,973,3438,969,3443,964,3,3449,959,3452,953,3454,946,3,3457,940,
     3458,933,3458,925,1,3458,925,1,3458,299,3,3458,294,3457,288,3455,282,3,
     3453,276,3449,270,3444,265,3,3439,260,3431,256,3422,252,3,3413,249,3401,
     248,3387,248,1,3387,248,1,3387,222,1,3906,222,3,3901,232,3897,244,3895,
     257,3,3892,270,3890,282,3888,294,3,3887,306,3886,316,3886,324,3,3886,332,
     3886,337,3886,338,1,3886,338,1,3872,340,3,3868,322,3861,308,3851,297,3,
     3841,286,3830,277,3816,271,3,3803,265,3788,261,3773,258,3,3758,256,3743,
     255,3729,255,1,3729,255,1,3610,255,1,3610,532,1,3856,532,3,3850,543,3845,
     555,3842,569,3,3840,582,3837,594,3836,606,1,3836,606,3,3835,620,3834,634,
     3833,648,1,3833,648,1,3819,650,3,3815,629,3809,613,3802,602,3,3795,590,
     3784,582,3769,576,3,3755,571,3735,568,3709,566,3,3684,565,3651,565,3610,
     565,1,3610,565,1,3610,929,3,3610,934,3611,939,3613,945,3,3615,951,3619,
     957,3624,962,3,3629,967,3636,972,3645,975,3,3654,979,3666,981,3680,981,1,
     3680,981],
    [4629,458,1,4166,458,3,4165,466,4165,473,4165,481,3,4165,488,4165,495,
     4165,502,1,4165,502,3,4165,536,4167,568,4171,600,3,4175,631,4183,659,
     4194,684,3,4206,708,4222,728,4242,743,3,4262,759,4288,767,4321,767,1,
     4321,767,3,4341,767,4360,764,4376,757,3,4392,751,4407,741,4419,730,3,
     4431,718,4442,704,4450,688,3,4459,673,4467,655,4473,637,1,4473,637,1,
     4597,679,3,4584,697,4569,713,4551,728,3,4534,743,4514,756,4491,767,3,
     4469,779,4443,787,4416,793,3,4388,800,4357,803,4324,803,1,4324,803,3,
     4286,803,4252,799,4222,791,3,4191,782,4164,771,4140,757,3,4116,742,4095,
     725,4078,706,3,4060,687,4045,666,4033,644,3,4022,622,4013,599,4007,575,3,
     4002,551,3999,528,3999,504,1,3999,504,3,3999,482,4002,460,4007,436,3,
     4012,413,4020,390,4031,368,3,4041,345,4055,324,4072,305,3,4088,285,4108,
     267,4132,252,3,4155,237,4182,225,4212,217,3,4242,208,4276,203,4313,203,1,
     4313,203,3,4368,203,4415,210,4454,224,3,4493,238,4524,256,4550,279,3,
     4575,303,4593,330,4606,360,3,4618,391,4626,424,4629,458,1,4629,458],
    [4316,240,1,4316,240,3,4291,240,4269,245,4252,254,3,4234,264,4219,277,
     4208,293,3,4196,310,4187,329,4181,351,3,4175,374,4171,397,4168,423,1,
     4168,423,1,4464,423,3,4462,398,4458,374,4453,352,3,4447,330,4439,311,
     4428,294,3,4417,277,4403,264,4384,255,3,4366,245,4344,240,4316,240],
    [4895,797,1,4895,797,3,4870,797,4850,796,4835,795,3,4819,793,4806,791,
     4796,789,3,4786,787,4778,785,4772,784,3,4765,782,4759,781,4752,781,1,
     4752,781,3,4755,769,4757,759,4758,749,3,4759,739,4760,730,4760,722,1,
     4760,722,3,4760,710,4759,699,4757,689,3,4754,678,4752,668,4749,656,1,
     4749,656,1,4767,655,3,4775,672,4786,687,4801,700,3,4816,712,4832,723,
     4851,732,3,4869,741,4888,747,4908,752,3,4928,757,4947,759,4965,759,1,
     4965,759,3,4987,759,5007,756,5024,750,3,5041,744,5056,736,5068,726,3,
     5080,716,5089,704,5095,690,3,5101,676,5104,661,5104,644,1,5104,644,3,
     5104,626,5100,611,5093,600,3,5086,588,5076,579,5063,572,3,5051,565,5036,
     560,5019,557,3,5002,553,4984,551,4965,549,1,4965,549,3,4950,547,4935,545,
     4918,543,3,4901,541,4884,538,4867,534,3,4851,530,4834,524,4819,517,3,
     4803,510,4789,501,4778,490,3,4766,479,4756,466,4749,451,3,4742,435,4738,
     417,4738,395,1,4738,395,3,4738,370,4743,348,4753,329,3,4764,310,4777,294,
     4794,280,3,4810,266,4829,255,4851,246,3,4873,238,4895,231,4918,226,3,
     4941,221,4964,217,4986,215,3,5009,213,5030,212,5048,212,1,5048,212,3,
     5081,212,5110,213,5135,217,3,5159,220,5180,222,5197,222,1,5197,222,3,
     5193,234,5191,246,5190,257,3,5189,269,5188,279,5188,287,1,5188,287,3,
     5188,299,5189,309,5191,320,3,5193,330,5195,341,5199,352,1,5199,352,1,
     5181,353,3,5174,338,5168,325,5162,312,3,5157,300,5148,289,5136,280,3,
     5124,271,5108,264,5087,259,3,5066,254,5037,252,5000,252,1,5000,252,3,
     4988,252,4975,254,4963,258,3,4950,262,4938,268,4927,276,3,4916,284,4908,
     295,4900,307,3,4893,319,4890,334,4890,350,1,4890,350,3,4890,372,4895,389,
     4904,401,3,4914,414,4926,424,4939,431,3,4953,437,4967,442,4982,444,3,
     4997,447,5009,448,5019,449,1,5019,449,3,5032,450,5046,451,5063,453,3,
     5080,456,5097,459,5114,463,3,5131,468,5149,473,5165,480,3,5182,487,5197,
     496,5211,508,3,5224,519,5235,532,5243,548,3,5251,564,5255,583,5255,605,1,
     5255,605,3,5255,634,5249,658,5239,679,3,5228,700,5214,717,5196,731,3,
     5178,745,5157,757,5133,766,3,5109,774,5084,781,5057,786,3,5030,790,5003,
     793,4976,795,3,4948,796,4921,797,4895,797],
    [5579,255,1,5347,255,3,5357,236,5363,216,5366,197,3,5369,178,5370,161,
     5370,147,1,5370,147,3,5370,143,5370,140,5370,137,3,5370,134,5369,131,
     5369,129,1,5369,129,3,5369,127,5369,125,5369,122,1,5369,122,1,5388,119,3,
     5389,135,5394,149,5401,160,3,5409,171,5418,180,5429,188,3,5440,195,5452,
     201,5466,206,3,5479,211,5492,214,5505,216,3,5518,219,5530,220,5541,221,3,
     5552,221,5561,222,5568,222,1,5568,222,1,5979,222,3,5970,241,5963,261,
     5961,280,3,5958,298,5956,315,5956,329,1,5956,329,3,5956,333,5956,337,
     5956,340,3,5956,343,5957,345,5957,347,1,5957,347,3,5957,350,5957,352,
     5957,354,1,5957,354,1,5939,357,3,5937,342,5933,328,5925,317,3,5918,306,
     5908,296,5897,289,3,5886,281,5874,275,5861,271,3,5847,266,5834,263,5822,
     260,3,5809,258,5797,257,5786,256,3,5774,255,5766,255,5759,255,1,5759,255,
     1,5749,255,3,5716,257,5686,265,5660,279,3,5634,294,5612,313,5594,337,3,
     5576,360,5562,387,5552,418,3,5542,448,5537,480,5537,513,1,5537,513,3,
     5537,547,5540,579,5545,609,3,5551,640,5560,667,5572,690,3,5585,714,5601,
     733,5621,746,3,5641,760,5665,767,5693,767,1,5693,767,3,5714,767,5732,764,
     5747,757,3,5762,751,5775,741,5786,730,3,5797,718,5806,704,5813,688,3,
     5821,673,5828,655,5834,637,1,5834,637,1,5957,679,3,5945,697,5930,713,
     5914,728,3,5898,743,5879,756,5858,767,3,5837,779,5813,787,5786,793,3,
     5760,800,5730,803,5696,803,1,5696,803,3,5661,803,5629,799,5599,791,3,
     5570,784,5544,773,5521,759,3,5497,746,5477,730,5460,711,3,5442,693,5428,
     673,5416,652,3,5405,630,5396,608,5390,585,3,5385,562,5382,539,5382,516,1,
     5382,516,3,5382,486,5386,458,5395,432,3,5404,405,5417,381,5433,359,3,
     5450,336,5471,317,5495,299,3,5520,281,5548,267,5579,255,1,5579,255]
  ];

  /* Lay the wordmark into the context's current path, scaled to `width` and
   * centred on (cx, cy). Left as a path rather than painted so the caller
   * can stroke it, fill it, shadow it, or do all three over one path —
   * which is exactly what the title screen does. */
  function markPath(ctx, cx, cy, width) {
    var s = width / MARK_W;
    var ox = cx - width / 2, oy = cy - (MARK_H * s) / 2;
    ctx.beginPath();
    for (var i = 0; i < MARK.length; i++) {
      var a = MARK[i], j = 2;
      ctx.moveTo(ox + a[0] * s, oy + a[1] * s);
      while (j < a.length) {
        if (a[j] === 1) {
          ctx.lineTo(ox + a[j + 1] * s, oy + a[j + 2] * s);
          j += 3;
        } else {
          ctx.bezierCurveTo(ox + a[j + 1] * s, oy + a[j + 2] * s,
                            ox + a[j + 3] * s, oy + a[j + 4] * s,
                            ox + a[j + 5] * s, oy + a[j + 6] * s);
          j += 7;
        }
      }
      ctx.closePath();
    }
  }

  /* The card's palette, named once. */
  var INK = {
    navy:    '#232973',      // the field
    gold:    '#ffc90e',      // the four long points
    steel:   '#7092be',      // the four short ones
    pale:    '#c3c3c3',      // the lit facet of every point
    edge:    '#4f4f4f',      // the line around everything
    letter:  '#ffffff',
    halo:    '#373c7d'       // the blue rim on the letters, from the card
  };

  /* ---- the rose ----------------------------------------------------------
   *
   * Eight points, each a kite from the centre: tip at `len` along its own
   * bearing, and two shoulders at `waist` along the bearings 45 degrees
   * either side — so every point's shoulders ARE its neighbours' shoulders
   * and the whole rose closes into one sixteen-sided outline with no seams
   * to line up.
   *
   * Each kite is then split down its own axis into two facets, and this is
   * the part that makes it read as a compass rose rather than as a star:
   * the facet on the CLOCKWISE side of every point is pale and the one on
   * the counter-clockwise side is coloured, all the way round, the same
   * sense for all eight. Not lighting — a pinwheel. Shading it as if lit
   * from one direction gives a lumpy object; shading it as a pinwheel gives
   * the emblem. Measured off Astra's card, which does exactly this.
   */
  var ROSE_WAIST = 0.135;          // hub radius, as a fraction of the long points
  var ROSE_SHORT = 0.60;           // how long the intercardinal points are

  function rosePoints(cx, cy, r) {
    var out = [];
    for (var i = 0; i < 8; i++) {
      var th = i * Math.PI / 4;                       // 0 = up, clockwise
      var len = (i % 2 === 0) ? r : r * ROSE_SHORT;
      out.push({
        cardinal: i % 2 === 0,
        tip: { x: cx + Math.sin(th) * len, y: cy - Math.cos(th) * len },
        cw:  shoulder(cx, cy, th + Math.PI / 4, r * ROSE_WAIST),
        ccw: shoulder(cx, cy, th - Math.PI / 4, r * ROSE_WAIST)
      });
    }
    return out;
  }
  function shoulder(cx, cy, th, d) {
    return { x: cx + Math.sin(th) * d, y: cy - Math.cos(th) * d };
  }

  /* `glow` is what makes a FAINT rose possible without it going muddy.
   *
   * Ordinary alpha mixes toward the backdrop, and the backdrop here is a
   * saturated navy — so gold at a third opacity is not pale gold, it is
   * brown, and the emblem reads as a stain rather than as something
   * behind the title. Added instead of mixed, the same gold lands warm and
   * luminous and the whole rose reads as light coming through the card.
   * The edges go light rather than dark for the same reason, which turns
   * the outline into the seam between facets instead of a black line drawn
   * on top of them. */
  /* Added light is not mixed paint, so the three inks need different
   * weights to come out looking like the card. Gold is dark for its
   * chroma — adding it at the same strength as the near-white pale facet
   * buries it, and the rose comes out blue with tan bits. These three
   * numbers are the whole of the tuning, and they are what makes a faint
   * rose still read as gold-and-silver. */
  var GLOW_W = { pale: 0.72, gold: 1.45, steel: 0.70 };

  function drawRose(ctx, cx, cy, r, alpha, glow) {
    var pts = rosePoints(cx, cy, r);
    var a = (alpha === undefined) ? 1 : alpha;
    ctx.save();
    if (glow) ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, r * 0.010);
    ctx.strokeStyle = glow ? 'rgba(150,175,225,0.5)' : INK.edge;
    function weight(key) {
      ctx.globalAlpha = glow ? Math.min(1, a * GLOW_W[key]) : a;
    }
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      weight('pale');
      facet(ctx, cx, cy, p.cw, p.tip, INK.pale);
      weight(p.cardinal ? 'gold' : 'steel');
      facet(ctx, cx, cy, p.ccw, p.tip, p.cardinal ? INK.gold : INK.steel);
    }
    ctx.restore();
  }

  function facet(ctx, cx, cy, a, tip, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  }

  /* ---- the title card, shared by the boot card and the title screen -----
   *
   * Both screens draw the same sky and the same lockup from here, so the
   * boot card in index.html is the title card's first frame and the hand
   * over between them is a crossfade between two identical pictures.
   *
   * THE SKY. Deep space rather than the card's navy, so the rose reads as
   * a star to steer by and the screen reads as a space game before a word
   * of it is read. A fixed field from a constant seed, kept as fractions of
   * the screen so a resize moves the stars rather than reshuffling them. */
  var SKY_TOP = '#0b0f2c', SKY_EDGE = '#020309';
  var skyStars = null;
  function stars() {
    if (skyStars) return skyStars;
    var s = 0x6d616e69;                         // "mani"
    function r() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    skyStars = [];
    for (var i = 0; i < 760; i++) {
      var c = r();
      skyStars.push({ x: r(), y: r(), r: 0.4 + r() * r() * 1.9, a: 0.12 + r() * 0.55,
                      col: c < 0.10 ? '#ffe2b0' : c < 0.28 ? '#b8c8ff' : '#dbe6ff',
                      ph: r() * Math.PI * 2, sp: 0.25 + r() * 0.6 });
    }
    return skyStars;
  }
  /* `now` in seconds twinkles it; leave it out for a still field. */
  function drawSky(ctx, w, h, now) {
    ctx.save();
    var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_EDGE);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var list = stars();
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      ctx.globalAlpha = st.a * (now === undefined ? 0.85 : 0.62 + 0.38 * Math.sin(now * st.sp + st.ph));
      ctx.fillStyle = st.col;
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* THE LAYOUT. Wide screens put the lockup — wordmark over the rose, with
   * the tagline under it — in a column of its own on the left, and leave
   * the right for the menu and the captain's story under it, each in a box
   * menuW wide. Narrow or short screens stack it: a smaller lockup on top,
   * the menu centred under it, and no story, because there is no room for
   * one that would not crowd the menu. The lockup does not depend on the
   * menu's height, so the boot card can place it before the menu exists. */
  var ROSE_GLOW = 0.62;             // added light on black wants more than the navy did
  function layout(w, h, menuW) {
    var wide = w >= 1000 && h >= 560;
    var L = { wide: wide };
    if (wide) {
      L.menuX = Math.round(Math.max(w * 0.70 - menuW / 2, w * 0.5 + 16));
      L.cx = Math.round(L.menuX / 2);
      L.markW = Math.min(w * 0.36, (L.menuX - 48) * 0.92, 700);
      L.markH = L.markW / (MARK_W / MARK_H);
      L.roseR = Math.max(60, Math.min(L.markW * 0.42, (h * 0.80 - L.markH - 110) / 2));
      var block = L.markH + 24 + L.roseR * 2 + 64;
      L.markCy = Math.round((h - block) / 2 + L.markH / 2);
      L.roseCy = Math.round(L.markCy + L.markH / 2 + 24 + L.roseR);
      L.lineY = Math.round(L.roseCy + L.roseR + 30);
    } else {
      L.cx = Math.round(w / 2);
      L.markW = Math.min(w * 0.62, 520);
      L.markH = L.markW / (MARK_W / MARK_H);
      L.roseR = Math.max(40, Math.min(w * 0.16, h * 0.13));
      L.markCy = Math.round(20 + L.markH / 2);
      L.roseCy = Math.round(L.markCy + L.markH / 2 + 12 + L.roseR);
      L.lineY = Math.round(L.roseCy + L.roseR + 24);
      L.menuX = Math.round((w - menuW) / 2);
    }
    return L;
  }

  /* Wordmark over rose, in the three passes the card always used: a shadow
   * to lift the letters off the sky, the blue halo, then the letters. */
  function drawLockup(ctx, L, aRose, aMark) {
    if (aRose > 0) drawRose(ctx, L.cx, L.roseCy, L.roseR, ROSE_GLOW * aRose, true);
    if (!(aMark > 0)) return;
    ctx.save();
    ctx.globalAlpha = aMark;
    markPath(ctx, L.cx, L.markCy, L.markW);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = Math.max(6, L.markH * 0.13);
    ctx.shadowOffsetY = Math.max(2, L.markH * 0.035);
    ctx.fillStyle = INK.letter;
    ctx.fill('evenodd');
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, L.markH * 0.035);
    ctx.strokeStyle = INK.halo;
    ctx.stroke();
    ctx.fillStyle = INK.letter;
    ctx.fill('evenodd');
    ctx.restore();
  }

  var Logo = {
    MARK_W: MARK_W, MARK_H: MARK_H, MARK_ASPECT: MARK_W / MARK_H,
    INK: INK,
    markPath: markPath,
    drawRose: drawRose,
    rosePoints: rosePoints,
    drawSky: drawSky,
    layout: layout,
    drawLockup: drawLockup
  };

  global.Logo = Logo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logo;
})(typeof window !== 'undefined' ? window : globalThis);
