# ShuttleStat 🏸

ShuttleStat is a feature-rich Badminton Score Keeper application designed for ZeppOS smartwatches. It allows players to track scores, serves, streaks, and health statistics directly from their wrist.

## Features

- **Match Score Tracking**: Easily track points for you and your opponent with simple tap zones.
- **Server Indicator**: Visual indicator showing who is serving and from which side (Left/Right) based on Badminton rules (Even/Odd scores).
- **Match Stats**: View current match statistics including total matches played and wins.
- **Health Integration**: Monitor real-time Heart Rate and Calorie burn during your game.
- **Streak Tracking**: Visual "Lightning Bolt" indicators when a player is on a winning streak (2+ points).
- **Setup Wizard**: Quick setup to decide who serves first.
- **Resume Capability**: Auto-save functionality allows you to resume an active match if the app is closed.
- **Responsive Design**: Adapts layout for various ZeppOS devices (Round and Square screens).

## Usage

### Navigation
ShuttleStat uses a vertical slide interface with 3 main screens:
1.  **Stats Screen** (Top): View cumulative stats (Matches, Wins, Calories, HR).
2.  **Game Screen** (Center): The main court view for scoring.
3.  **Settings Screen** (Bottom): Configure game preferences.

Use **Up/Down Gestures** to cycle between screens.

### Scoring
- **Tap Top Half (Red)**: Add point to Opponent.
- **Tap Bottom Half (Green)**: Add point to Yourself.
- **Note**: The app automatically handles server rotation and court side indication.

## Development

### Prerequisites
- [ZeppOS CLI](https://docs.zepp.com/docs/guides/tools/cli/)
- Node.js & NPM

### Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Building
To build the application for a specific device target (e.g., Amazfit Balance):
```bash
zeus build
```

To run in the simulator:
```bash
zeus dev
```

## Supported Devices
Includes but not limited to:
- Amazfit GTR 4 / Limited Edition
- Amazfit GTS 4, Active, Active Edge
- Amazfit Balance, Cheetah, Falcon, T-Rex Ultra/3
- Amazfit Bip 5/6
