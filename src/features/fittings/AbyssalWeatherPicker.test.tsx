import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AbyssalWeatherPicker } from './AbyssalWeatherPicker';
import { useAbyssalWeather } from './abyssalWeatherSelection';

afterEach(() => useAbyssalWeather.setState({ weatherTypeId: null }));

describe('AbyssalWeatherPicker', () => {
  it('starts in normal space, and picks a weather at a strength', async () => {
    const user = userEvent.setup();
    render(<AbyssalWeatherPicker />);
    const trigger = screen.getByRole('combobox', { name: 'Abyssal weather' });
    expect(trigger).toHaveTextContent('Normal space');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Electrical 3' }));
    expect(useAbyssalWeather.getState().weatherTypeId).toBe(47383);
  });

  it('says what the weather picked does, at its strength', () => {
    useAbyssalWeather.setState({ weatherTypeId: 47383 });
    render(<AbyssalWeatherPicker />);
    expect(screen.getByText('Capacitor recharge time −50% · EM resists −70%')).toBeTruthy();
  });

  it('goes back to normal space', async () => {
    const user = userEvent.setup();
    useAbyssalWeather.setState({ weatherTypeId: 47390 });
    render(<AbyssalWeatherPicker />);
    await user.click(screen.getByRole('combobox', { name: 'Abyssal weather' }));
    await user.click(await screen.findByRole('option', { name: 'Normal space' }));
    expect(useAbyssalWeather.getState().weatherTypeId).toBeNull();
  });
});
