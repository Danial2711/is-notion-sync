// Small HTML fixtures shaped like the real IS pages (docs/SITE.md), used by the tests.

const fmgr = (nodes: Record<string, unknown>) =>
  `<html><body><main>listing</main><script>\nwindow.fmgrUzly = ${JSON.stringify(nodes)};\nwindow.other = {"a":1};\n</script></body></html>`;

const W = (datum: string) => ({ w: { 'w:p:1726925': { datum, upresneni: 'FI:PV079 (Autumn 2026)' } } });

export const PV079_ODE = fmgr({
  '/el/fi/podzim2026/PV079/ode/': { timestamp: '20251213230156', nazev: 'Homework Vaults' },
  '/el/fi/podzim2026/PV079/ode/203873423/': { nazev: 'HW01_RNG', timestamp: '20260913165837', slozka: 1, je_to_odevzdavarna: 1 },
  '/el/fi/podzim2026/PV079/ode/205497664/': { nazev: 'HW02_Keccak', timestamp: '20261011114700', slozka: 1, je_to_odevzdavarna: 1 },
  '/el/fi/podzim2026/PV079/ode/207161201/': { nazev: 'HW04_Side_channel', timestamp: '20261106000710', slozka: 1, je_to_odevzdavarna: 1, prava: W('202611152359') },
});

export const PV079_ASSIGNMENTS = fmgr({
  '/el/fi/podzim2026/PV079/um/assignments/': { nazev: 'Assignments', timestamp: '20260911000000' },
  '/el/fi/podzim2026/PV079/um/assignments/assignment_4/': { nazev: 'assignment_4', timestamp: '20261027142306', slozka: 1 },
  '/el/fi/podzim2026/PV079/um/assignments/assignment1.zip': { timestamp: '20260913165917' },
  '/el/fi/podzim2026/PV079/um/assignments/HW01_Comments.pdf': { timestamp: '20261012094731' },
  '/el/fi/podzim2026/PV079/um/assignments/assignment_5/': { nazev: 'assignment_5', timestamp: '20261108100000', slozka: 1 },
});

export const PV198_UM = fmgr({
  '/el/fi/podzim2026/PV198/um/': { nazev: 'Learning Materials', timestamp: '20251213000000' },
  '/el/fi/podzim2026/PV198/um/00_materials/': { nazev: '00_materials', timestamp: '20260914000000', slozka: 1 },
  '/el/fi/podzim2026/PV198/um/04_interrupts/': { nazev: '04_interrupts', timestamp: '20261006000000', slozka: 1 },
  '/el/fi/podzim2026/PV198/um/09_i2c/': { nazev: '09_i2c', timestamp: '20261106120000', slozka: 1 },
});

const chapter = (id: string, title: string, published: boolean, from: string, to: string) => `
<div data-prvek_ekvivalence_id="${id}" data-id="9${id}" class="io-element io-kapitola-box">
  <div class="hlavicka"><a href="/auth/el/fi/podzim2026/IA174/index.qwarp?prejit=${id}" data-warp-id="${id}" class="io-nav-link">
    <div class="io-kapitola-nazev"> ${title} </div></a></div>
  ${published ? '<div class="pl-2"><div class="io-kapitola-obsahuje"><div>1</div> Homework Vault</div></div>' : ''}
  <div class="row"><span class="nedurazne">Teacher recommends to study ${published && id === '9620916' ? 'now - ' : ''}from ${from} to ${to}.</span></div>
</div>`;

export const IA174_SYLLABUS = `<html><body>
<ul id="io-navigace-small"><li class="io-prvni-vrstva nav-9620912"><a href="#">Homework 1</a></li></ul>
<div id="prvek-obsah">
${chapter('9620900', 'Lecture 1 - Symmetric ciphers', true, '15/9/2026', '21/9/2026')}
${chapter('9620912', 'Homework 1', true, '6/10/2026', '21/10/2026')}
${chapter('9620916', 'Homework 2', true, '27/10/2026', '11/11/2026')}
${chapter('9620930', 'Homework 3', false, '2/12/2025', '16/12/2025')}
</div></body></html>`;

export const IA174_HW2 = `<html><body><main>
<h1>Homework 2</h1><p>Teacher recommends to study from 27/10/2026 to 11/11/2026.</p>
<p>The deadline for submission is</p><p><strong>Wednesday, November 11, 23:59 pm CET</strong></p>
<div class="vault">HW02 Submission vault <span>Submit until: 11/11/2026</span></div>
</main></body></html>`;

export const IA174_HW1 = IA174_HW2.replace(/Homework 2/g, 'Homework 1').replace('November 11', 'October 21').replace('Submit until: 11/11/2026', 'Submit until: 21/10/2026');

const nb = (id: string, name: string, content: string) => `
<div id="${id}" class="ipb-pol "><div class="row collapse">
  <div class="column small-12 medium-3 tucne ipb-nazev">${name}</div>
  <div class="column ipb-obsah"><div class="tk_vice_mene"><div class="obsah"><div class="overflow"><pre>${content}</pre></div></div></div></div>
  <div class="column ipb-zmeneno"><div>Last modified: 21. 10. 2026 21:20</div></div>
</div></div>`;

export const NOTEBOOKS = `<html><body><ul id="deeplinked-accordion" class="accordion">
<li id="predmet_1726884" class="accordion-item ipb-seznam-pol"><a href="#" class="accordion-title ">PA191 Advanced Computer Networking <span>Last modified: 21. 10. 2026 21:20</span></a>
<div class="accordion-content ">${nb('predmet_1726884_ode_hw03', 'HW03_SDN', '*3')}</div></li>
<li id="predmet_1726925" class="accordion-item ipb-seznam-pol"><a href="#" class="accordion-title ">PV079 <span>Last modified: 23. 10. 2026</span></a>
<div class="accordion-content ">${nb('x1', 'HW02_points', '(Part 1, Task 1, 1b) OK *1\n(Part 1, Task 2, 1.5b) OK *1.5\n(Part 2, Task 1, 1.5b) OK *1.5')}
${nb('x2', 'HW01_points', '1.1) *1.0 OK\n2.1) *2.5 Used N instead of M')}</div></li>
<li id="predmet_1726999" class="accordion-item ipb-seznam-pol"><a href="#" class="accordion-title ">PV198 Onechip Controllers</a>
<div class="accordion-content ">${nb('x3', 'HW SUM', '1 | 1 | 1 | *7')}${nb('x4', 'HW04', '*1 OK\n\nNitpick:\n- Some errors are ignored')}${nb('x5', 'prezence 05', '15. 9.: presence\n22. 9.: presence')}</div></li>
</ul></body></html>`;

export const EXAM_OVERVIEW = `<html><body><main>
<p>You have not signed up for any examination date available.</p>
<a href="prihl_na_zkousky?fakulta=1433;obdobi=10103;studium=1;lang=en;predmet=1726884;serie=207460">PA191 Advanced Computer Networking - pre-term exam</a> (number of examination dates: 1)
<a href="/auth/predmet/fi/podzim2026/IA174">IA174 Fundaments of Cryptography</a>
</main></body></html>`;

export const EXAM_SERIES = `<html><body><main>
<h2>PA191 Advanced Computer Networking - pre-term exam</h2>
<table><tr><td>no slot reserved<br>by you</td><td><a href="#">details</a> Wed 16. 12. 2026 08:00 A318 (examinations only (no resits)), reservations: 0, max. 30<br>
open for reservations from Wed 9. 12. 2026 17:00, open for reservations to Mon 14. 12. 2026 , cancellation possible to Mon 14. 12. 2026</td></tr></table>
</main></body></html>`;

export const LOGIN_PAGE = `<html><body><form data-abide novalidate method="post" enctype="application/x-www-form-urlencoded" class="islogin_form clearfix" id="prvek_1">
<input name="credential_0" type="text" value=""><input name="credential_1" type="password" value="">
<button type="submit" name="uloz" value="uloz">Log in</button></form></body></html>`;
