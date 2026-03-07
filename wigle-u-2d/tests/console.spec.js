const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const wigleUrl = () => {
  const filePath = path.resolve(__dirname, '..', 'wigle.html');
  return pathToFileURL(filePath).href;
};

async function gotoSimulation(page) {
  await page.goto(wigleUrl(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.energyLifeSim !== undefined);
}

async function setSliderValue(page, id, value) {
  await page.evaluate(
    ({ sliderId, nextValue }) => {
      const slider = document.getElementById(sliderId);
      slider.value = String(nextValue);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { sliderId: id, nextValue: value },
  );
}

function createParameterTest({
  param,
  expectedInitial,
  newValue,
  tolerance = 1e-3,
}) {
  test(`${param} slider syncs with uniforms`, async ({ page }) => {
    await gotoSimulation(page);

    const initialUniform = await page.evaluate(
      (name) =>
        window.energyLifeSim.computeVariables.field.material.uniforms[name]
          ?.value ?? null,
      param,
    );
    expect(initialUniform).not.toBeNull();
    expect(initialUniform).toBeCloseTo(expectedInitial, 3);

    await setSliderValue(page, param, newValue);

    await page.waitForFunction(
      ({ name, target, tol }) => {
        const uniform =
          window.energyLifeSim.computeVariables.field.material.uniforms[name];
        if (!uniform) return false;
        return Math.abs(uniform.value - target) <= tol;
      },
      { name: param, target: newValue, tol: tolerance },
    );

    const inputValue = await page.locator(`#${param}Value`).inputValue();
    expect(parseFloat(inputValue)).toBeCloseTo(newValue, 3);

    const avgText = await page.locator('#avgEnergy').innerText();
    expect(avgText.startsWith('Avg: ')).toBeTruthy();
    const numeric = parseFloat(avgText.replace('Avg: ', ''));
    expect(Number.isFinite(numeric)).toBeTruthy();
    expect(numeric).toBeGreaterThanOrEqual(0);
    expect(numeric).toBeLessThanOrEqual(1);
  });
}

test.describe('wigle.html', () => {
  test('loads without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({
          type: message.type(),
          text: message.text(),
        });
      }
    });

    await page.goto(wigleUrl(), { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    expect(consoleErrors, '페이지 로드 중 콘솔 에러가 없어야 합니다.').toEqual(
      [],
    );
  });

  createParameterTest({
    param: 'diffusionRate',
    expectedInitial: 0.333,
    newValue: 0.35,
  });

  createParameterTest({
    param: 'growthRate',
    expectedInitial: 0.607,
    newValue: 0.62,
  });

  createParameterTest({
    param: 'decayRate',
    expectedInitial: 0.378,
    newValue: 0.39,
  });

  createParameterTest({
    param: 'innerRadius',
    expectedInitial: 3.5,
    newValue: 3.8,
  });

  createParameterTest({
    param: 'outerRadius',
    expectedInitial: 7.5,
    newValue: 8.0,
  });
});
