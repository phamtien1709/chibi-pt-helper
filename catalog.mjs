// Đối chiếu PoliceTeam/musicque-farm @ 193d8bcc, ngày 21/10/2026.
const H = 3_600_000;
export const crops = Object.fromEntries([
  ['tomato','Cà chua',4,75,1], ['carrot','Cà rốt',6,108,1],
  ['pineapple','Dứa',10,165,1], ['watermelon','Dưa hấu',8,138,1],
  ['grape','Nho',16,240,1], ['rose','Hoa hồng',2,45,2],
  ['rice','Lúa',48,720,1], ['mango','Xoài',24,360,1],
  ['dragonFruit','Thanh long',12,189,1], ['sunflower','Hướng dương',12,189,2],
  ['tulip','Tulip',6,108,2], ['corn','Ngô',24,360,1],
  ['cosmos','Hoa sao nhái',3,62,2], ['lotus','Sen',8,140,2],
  ['pumpkin','Bí ngô',2,80,1], ['potato','Khoai tây',6,120,1],
  ['chili','Ớt',1,45,1], ['starfruit','Khế',24,360,1],
  ['strawberry','Dâu tây',2,60,1],
].map(([id,label,hours,yieldCount,price]) => [id,{label,growMs:hours*H,yield:yieldCount,price,seedPrice:10}]));
export const recipes = Object.fromEntries([
  ['fries','Khoai tây chiên',1,20000,{potato:500,egg:100}],
  ['starfruitYogurt','Sữa chua khế',1,12096,{milk:72,starfruit:96}],
  ['ketchup','Tương cà',6,20000,{tomato:1000}],
  ['eggCake','Bánh trứng',1,5880,{egg:12,rice:720}],
  ['milkCake','Bánh sữa',1,6160,{milk:20,rice:720}],
  ['riceMeal','Cơm',0.5,6211,{rice:1440}],
  ['eggRice','Cơm trứng',1,8040,{rice:1440,egg:12}],
  ['carrotRice','Cơm cà rốt',1,8244,{rice:1440,carrot:108}],
  ['mangoSalad','Salad xoài',1,7920,{mango:1440}],
  ['butterCorn','Ngô bơ',1,19000,{corn:1500,egg:300}],
  ['pancake','Bánh xèo',4,30000,{rice:2000,egg:100,pork:5}],
  ['pizza','Pizza',24,72000,{rice:5000,pork:5,beef:1,fish:1,egg:200}],
  ['fruitJuice','Nước trái cây',1,6030,{pineapple:338,grape:480}],
  ['watermelonJuice','Nước dưa hấu',2,10000,{watermelon:1000}],
  ['beefBalls','Bò viên',0.5,20000,{beef:2}],
  ['fishBalls','Cá viên',0.5,25000,{fish:2}],
  ['cheese','Phô mai',4,32000,{milk:100,egg:400}],
  ['chiliSauce','Tương ớt',0.5,3000,{chili:500}],
].map(([id,label,hours,price,ingredients]) => [id,{label,cookMs:hours*H,price,ingredients}]));
export const animals = {
  hen:{label:'Gà',maturityMs:24*H,cycleMs:6*H,product:'egg',yield:20},
  duck:{label:'Vịt',maturityMs:48*H,cycleMs:6*H,product:'duckEgg',yield:20},
  cow:{label:'Bò',maturityMs:72*H,cycleMs:6*H,product:'milk',yield:30},
  sheep:{label:'Cừu',maturityMs:48*H,cycleMs:12*H,product:'wool',yield:20},
  pig:{label:'Heo',maturityMs:48*H,cycleMs:0,product:'pork',yield:1},
  buffalo:{label:'Trâu',maturityMs:72*H,cycleMs:0,product:'buffalo',yield:1},
  fish:{label:'Cá',maturityMs:72*H,cycleMs:0,product:'fish',yield:1},
  turtle:{label:'Rùa',maturityMs:24*H,cycleMs:0,product:'turtle',yield:1},
  dog:{label:'Chó',maturityMs:24*H,cycleMs:0,product:null,yield:0},
};
export const units = { poultry:{label:'Gà / vịt',key:'poultry',feed:25}, livestock:{label:'Gia súc',key:'animals',feed:50}, pond:{label:'Ao',key:'fish',feed:25} };
export const labels = {egg:'Trứng gà',duckEgg:'Trứng vịt',milk:'Sữa',wool:'Len',pork:'Thịt heo',beef:'Thịt bò',fish:'Cá',buffalo:'Trâu',turtle:'Rùa',...Object.fromEntries(Object.entries(crops).map(([k,v])=>[k,v.label])),...Object.fromEntries(Object.entries(recipes).map(([k,v])=>[k,v.label]))};
export const FOOD_MS = 12*H;
