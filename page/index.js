import { createWidget, widget, prop, align, event, text_style, setStatusBarVisible } from '@zos/ui'
import { onGesture, GESTURE_UP, GESTURE_DOWN } from '@zos/interaction'
import { getDeviceSource, getDeviceInfo } from '@zos/device'
import { setScreenKeep } from '@zos/display'
import { Calorie, HeartRate } from '@zos/sensor'

// Safe Device Dimensions Defaults
let DEVICE_WIDTH = 480
let DEVICE_HEIGHT = 480

// SCALING HELPER
// Scale a value based on the ratio of CURRENT DEVICE WIDTH to REFERENCE (480)
// This ensures that if we are on 390px, everything shrinks proportionally.
const px = (val) => {
  if (DEVICE_WIDTH === 480) return val
  return Math.floor(val * DEVICE_WIDTH / 480)
}

// 1. ROBUST DIMENSION DETECTION
try {
  // Strategy A: @zos/device getDeviceInfo (Newest)
  try {
    const info = getDeviceInfo()
    if (info && info.width) {
      DEVICE_WIDTH = info.width
      DEVICE_HEIGHT = info.height
      console.log('Dims (@zos/device getDeviceInfo):', DEVICE_WIDTH, DEVICE_HEIGHT)
    }
  } catch (eA) {
    // Strategy B: @zos/device getDeviceSource (New)
    try {
      if (typeof getDeviceSource === 'function') {
        const source = getDeviceSource()
        if (source) {
          DEVICE_WIDTH = source.width
          DEVICE_HEIGHT = source.height
          console.log('Dims (@zos/device getDeviceSource):', DEVICE_WIDTH, DEVICE_HEIGHT)
        }
      }
    } catch (eB) {
      // Strategy C: hmSetting (Legacy)
      try {
        if (typeof hmSetting !== 'undefined' && hmSetting.getDeviceInfo) {
          const info = hmSetting.getDeviceInfo()
          if (info.width) {
            DEVICE_WIDTH = info.width
            DEVICE_HEIGHT = info.height
            console.log('Dims (hmSetting):', DEVICE_WIDTH, DEVICE_HEIGHT)
          }
        }
      } catch (eC) {
        console.log('All Dim Detection Failed. Defaulting to 480.')
      }
    }
  }
} catch (grandFail) { console.log('Grand Fail Dims', grandFail) }

Page({
  state: {
    showSplash: true,
    setupComplete: false,
    userSide: 1, // Default Me=Bottom
    startingServer: 1, // Default Me serves
    screenIndex: 1,
    screens: [],

    scores: [0, 0],
    streak: { count: 0, player: -1 }, // Streak tracking
    server: 0,
    matchStats: {
      matches: 0,
      wins: 0
    },
    healthData: {
      calories: 0,
      hr: '--',
      bp: '120/80'
    },
    settings: {
      sound: true,
      haptic: true
    },

    lastTapTime: 0,
    lastTapZone: -1
  },

  // ... (build/splash methods remain mostly same, skipping for brevity of replace if possible, but structure suggests I should just update config methods at bottom)

  // WAIT, I need to remove the duplicate let DEVICE_WIDTH at the top.
  // AND update initConfig/saveConfig at the bottom.
  // AND update resetMatch.
  // Since the file is small enough (600 lines), I can replace the relevant chunks.

  // Let's use MULTI REPLACE for this.

  // THIS TOOL CALL IS JUST A PLACEHOLDER COMMENT, I WILL USE MULTI_REPLACE.
  // actually I can't return without doing anything.
  // I will scroll down to initConfig/saveConfig/resetMatch.


  build() {
    console.log('FULL APP RESTORE - SPLASH ENABLED')
    // Hide System Status Bar
    try {
      if (typeof setStatusBarVisible === 'function') setStatusBarVisible(false)
      else if (typeof hmUI !== 'undefined' && hmUI.setStatusBarVisible) hmUI.setStatusBarVisible(false)
    } catch (e) { }

    // Create UI
    try {
      this.initUI()
      this.createSplashScreen()
    } catch (e) { console.log('UI Creation Error', e) }

    // Init sensors safely
    try { this.initSensors() } catch (e) { }
  },

  createSplashScreen() {
    console.log('Creating Splash Screen')
    try {
      const splash = createWidget(widget.GROUP, { x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT })

      // Black BG
      const bg = splash.createWidget(widget.FILL_RECT, {
        x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT, color: 0x000000
      })
      bg.addEventListener(event.CLICK_DOWN, () => { this.dismissSplash() })

      // App Icon (Centered)
      const iconSize = px(120) // Scld
      splash.createWidget(widget.IMG, {
        x: (DEVICE_WIDTH - iconSize) / 2,
        y: (DEVICE_HEIGHT - iconSize) / 2 - px(20),
        w: iconSize, h: iconSize,
        src: 'icon.png'
      })

      // Tap Hint
      splash.createWidget(widget.TEXT, {
        x: 0, y: DEVICE_HEIGHT - px(100), w: DEVICE_WIDTH, h: px(50),
        text_size: px(20), color: 0xAAAAAA,
        align_h: align.CENTER_H, align_v: align.CENTER_V,
        text: '(Tap to Start)'
      })

      // Interaction Layer
      const hitBox = splash.createWidget(widget.IMG, {
        x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT, src: ''
      })
      hitBox.addEventListener(event.CLICK_UP, () => { this.dismissSplash() })

      this.state.splashGroup = splash

    } catch (e) { console.log('Splash Creation Error', e) }
  },

  dismissSplash() {
    console.log('dismissSplash called')

    // Clear timer if exists (Safety)
    if (this.splashTimer) {
      if (typeof clearTimeout === 'function') clearTimeout(this.splashTimer)
      else if (typeof clearInterval === 'function') clearInterval(this.splashTimer)
      this.splashTimer = null
    }

    if (this.state.splashGroup) {
      this.state.splashGroup.setProperty(prop.VISIBLE, false)
      this.state.showSplash = false

      // LOGIC V2: Auto-detect Match State
      if (this.hasActiveMatch()) {
        // If Active Match Found -> Offer Resume or New
        this.createStartDialog()
      } else {
        // If No Active Match -> Go directly to New Game Setup (Serve Selection)
        // Ensure we treat this as a fresh start
        this.resetMatch('new_setup')
        this.createSetupModal()
      }
    }
  },

  hasActiveMatch() {
    // Criteria for Active Match:
    // 1. Setup must be complete (Server selected, etc.)
    if (!this.state.setupComplete) return false

    // 2. Optimization: If scores are 0-0 and no matches played yet, maybe not "active"?
    // But user might have just set it up and exited. We should respect explicit setup.
    // User said: "If no active match -> skip choice".
    // If I setup and exist at 0-0, is that active? Yes, I selected server. I want to resume that state.
    // So simply `setupComplete` is a good proxy. 
    // EXCEPT: If I finished a match? 
    // If I finished, scores might be [21, 19]. That is "Active" (Paused/Finished).

    return true
  },

  createStartDialog() {
    const group = createWidget(widget.GROUP, { x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT })
    this.startDialog = group

    // Black BG
    group.createWidget(widget.FILL_RECT, { x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT, color: 0x000000 })

    // Title
    group.createWidget(widget.TEXT, {
      x: 0, y: px(40), w: DEVICE_WIDTH, h: px(50),
      text_size: px(32), color: 0xFFD700, align_h: align.CENTER_H,
      text: 'Resume Match?'
    })

    const btnW = px(200)
    const btnH = px(80)
    const startX = (DEVICE_WIDTH - btnW) / 2
    let currentY = px(120)

    group.createWidget(widget.BUTTON, {
      x: startX, y: currentY, w: btnW, h: btnH,
      text: 'RESUME',
      color: 0xffffff, normal_color: 0x333333, press_color: 0x555555, radius: px(12),
      click_func: () => {
        this.startDialog.setProperty(prop.VISIBLE, false)
        this.state.screenIndex = 1
        this.updateScreenVisibility()
      }
    })
    currentY += btnH + px(30)

    group.createWidget(widget.BUTTON, {
      x: startX, y: currentY, w: btnW, h: btnH,
      text: 'NEW MATCH',
      color: 0xffffff, normal_color: 0x005500, press_color: 0x007700, radius: px(12),
      click_func: () => {
        this.startDialog.setProperty(prop.VISIBLE, false)
        this.resetMatch('new_setup')
        this.createSetupModal()
      }
    })
  },



  initSensors() {
    try {
      const hr = new HeartRate()
      hr.onCurrentChange((val) => { this.state.healthData.hr = val; this.updateStatsUI() })
    } catch (e) { }
    try {
      const calorie = new Calorie()
      this.state.healthData.calories = calorie.getCurrent()
      this.timer = setInterval(() => {
        this.state.healthData.calories = calorie.getCurrent()
        this.updateStatsUI()
      }, 10000)
    } catch (e) { }
  },

  onDestroy() {
    if (this.timer) clearInterval(this.timer)
    this.saveConfig()
  },

  initUI() {
    this.createScreen1()
    this.createScreen2()
    this.createScreen3()
    this.updateScreenVisibility()
    onGesture({
      callback: (event) => {
        if (event === GESTURE_UP) this.cycleScreen(1)
        else if (event === GESTURE_DOWN) this.cycleScreen(-1)
      }
    })
  },

  cycleScreen(direction) {
    let next = this.state.screenIndex + direction
    if (next > 2) next = 0
    if (next < 0) next = 2
    this.state.screenIndex = next
    if (this.state.screenIndex === 0) this.updateStatsUI()
    if (this.state.screenIndex === 1) this.updateGameUI()
    this.updateScreenVisibility()
  },

  updateScreenVisibility() {
    if (this.state.showSplash) {
      if (this.state.screens) this.state.screens.forEach(g => { if (g) g.setProperty(prop.VISIBLE, false) })
      return
    }
    this.state.screens.forEach((group, index) => {
      if (group) group.setProperty(prop.VISIBLE, index === this.state.screenIndex)
    })
  },

  createScreen1() {
    const group = createWidget(widget.GROUP, {
      x: 0, y: 20, w: DEVICE_WIDTH, h: DEVICE_HEIGHT
    })

    // BG
    group.createWidget(widget.FILL_RECT, { x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT, color: 0x000000 })

    // NO TITLE (Removed "MY STATS")

    // LAYOUT CONSTANTS
    const isRound = (DEVICE_WIDTH === DEVICE_HEIGHT)

    // Content Width logic
    let contentW
    if (isRound) contentW = DEVICE_WIDTH * 0.72
    else contentW = DEVICE_WIDTH - px(20)

    const startX = (DEVICE_WIDTH - contentW) / 2

    const gap = px(10)
    const smallCardW = (contentW - gap) / 2
    const sqH = px(130)
    const wideH = px(80)

    // Start Y - Higher up since no title (px(40))
    let curY = px(40)

    this.statWidgets = {}

    // ROW 1: Matches & Wins
    this.statWidgets.matches = this.createStatCard(group, startX, curY, smallCardW, sqH, 'Matches', this.state.matchStats.matches.toString(), '🏸', 0x222222, 0xffffff)
    this.statWidgets.wins = this.createStatCard(group, startX + smallCardW + gap, curY, smallCardW, sqH, 'Wins', this.state.matchStats.wins.toString(), '🏆', 0xFFD700, 0x000000)

    curY += sqH + gap

    // ROW 2: Calories
    this.statWidgets.calories = this.createStatRowCard(group, startX, curY, contentW, wideH, 'Calories', this.state.healthData.calories, '🔥', 0xE65100, 0xffffff)

    curY += wideH + gap

    // ROW 3: Heart Rate
    this.statWidgets.hr = this.createStatRowCard(group, startX, curY, contentW, wideH, 'Heart Rate', this.state.healthData.hr, '❤️', 0xB71C1C, 0xffffff)

    this.state.screens[0] = group
  },

  createStatCard(group, x, y, w, h, label, value, icon, bgColor, textColor) {
    group.createWidget(widget.FILL_RECT, { x: x, y: y, w: w, h: h, color: bgColor, radius: px(16) })

    // Icon Top Left
    group.createWidget(widget.TEXT, {
      x: x + px(10), y: y + px(10), w: w, h: px(30),
      text_size: px(24), text: icon, color: textColor
    })

    // Value Center
    const valWidget = group.createWidget(widget.TEXT, {
      x: x, y: y + px(30), w: w, h: px(50),
      text_size: px(40), color: textColor,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: value.toString()
    })

    // Label Bottom
    group.createWidget(widget.TEXT, {
      x: x, y: y + h - px(35), w: w, h: px(30),
      text_size: px(18), color: textColor,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      alpha: 150, text: label.toUpperCase()
    })
    return valWidget
  },

  createStatRowCard(group, x, y, w, h, label, value, icon, bgColor, textColor) {
    group.createWidget(widget.FILL_RECT, { x: x, y: y, w: w, h: h, color: bgColor, radius: px(16) })

    // Icon Left
    group.createWidget(widget.TEXT, {
      x: x, y: y, w: px(60), h: h,
      text_size: px(30), text: icon, color: textColor,
      align_h: align.CENTER_H, align_v: align.CENTER_V
    })

    // Label
    group.createWidget(widget.TEXT, {
      x: x + px(60), y: y, w: w - px(160), h: h,
      text_size: px(22), color: textColor, align_v: align.CENTER_V, text: label
    })

    // Value Right
    return group.createWidget(widget.TEXT, {
      x: x + w - px(100), y: y, w: px(90), h: h,
      text_size: px(32), color: textColor, align_h: align.RIGHT, align_v: align.CENTER_V, text: value.toString()
    })
  },

  updateStatsUI() {
    if (this.statWidgets.matches) this.statWidgets.matches.setProperty(prop.TEXT, this.state.matchStats.matches.toString())
    if (this.statWidgets.wins) this.statWidgets.wins.setProperty(prop.TEXT, this.state.matchStats.wins.toString())
    if (this.statWidgets.calories) this.statWidgets.calories.setProperty(prop.TEXT, this.state.healthData.calories.toString())
    if (this.statWidgets.hr) this.statWidgets.hr.setProperty(prop.TEXT, this.state.healthData.hr.toString())
  },

  // SETUP WIZARD
  createSetupModal() {
    // Create a covering group
    const modal = createWidget(widget.GROUP, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT
    })
    this.setupModal = modal

    // Black Background
    modal.createWidget(widget.FILL_RECT, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT, color: 0x000000
    })

    // Go straight to Server Selection
    this.showSetupStep2(modal)
  },

  showSetupStep2(group) {
    // Title
    group.createWidget(widget.TEXT, {
      x: 0, y: px(30), w: DEVICE_WIDTH, h: px(50),
      text_size: px(32), color: 0xFFD700, align_h: align.CENTER_H, // Gold
      text: 'ShuttleStat'
    })

    // Question
    group.createWidget(widget.TEXT, {
      x: 0, y: px(80), w: DEVICE_WIDTH, h: px(40),
      text_size: px(22), color: 0xffffff, align_h: align.CENTER_H,
      text: 'Who Serves First?'
    })

    const btnWidth = px(220)
    const btnHeight = px(100)
    const startX = (DEVICE_WIDTH - btnWidth) / 2

    // OPPONENT Button (Red - Matches Court)
    group.createWidget(widget.BUTTON, {
      x: startX, y: px(260), w: btnWidth, h: btnHeight,
      text: 'OPPONENT',
      text_size: px(24),
      color: 0xffffff,
      normal_color: 0xA52A2A, // Brown/Red (Same as Court)
      press_color: 0x751A1A,
      radius: px(16),
      click_func: () => {
        this.state.startingServer = 0
        this.completeSetup()
      }
    })

    // ME Button (Green - Matches Court)
    group.createWidget(widget.BUTTON, {
      x: startX, y: px(140), w: btnWidth, h: btnHeight,
      text: 'ME',
      text_size: px(24),
      color: 0xffffff,
      normal_color: 0x2E8B57, // Sea Green (Same as Court)
      press_color: 0x1E5B37,
      radius: px(16),
      click_func: () => {
        this.state.startingServer = 1
        this.completeSetup()
      }
    })
  },
  completeSetup() {
    this.state.server = this.state.startingServer
    this.state.setupComplete = true
    this.state.userSide = 1 // Hardcode user as Player 1 (Bottom)

    // Force to Game Screen
    this.state.screenIndex = 1

    // Update Labels on Game Screen
    this.recreateGameScreen()
    this.updateGameUI()

    // Hide Modal
    if (this.setupModal) this.setupModal.setProperty(prop.VISIBLE, false)

    // Ensure visibility is correct
    this.updateScreenVisibility()
  },

  createScreen2() {
    const group = createWidget(widget.GROUP, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT
    })
    this.gameGroup = group

    // Court Colors
    // User is ALWAYS Bottom (Green)
    // Opponent is ALWAYS Top (Red)
    const myColor = 0x2E8B57 // Sea Green
    const oppColor = 0xA52A2A // Brown/Red

    // Top Half (Opponent)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT / 2, color: oppColor
    })

    // Bottom Half (Me)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: DEVICE_HEIGHT / 2, w: DEVICE_WIDTH, h: DEVICE_HEIGHT / 2, color: myColor
    })

    // Horizontal Net (Realistic)
    const netY = DEVICE_HEIGHT / 2

    // 1. Net Shadow (Simulates Height)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY + px(4), w: DEVICE_WIDTH, h: px(6),
      color: 0x1E5B37, // Darker Green Shadow
    })

    // 2. Net Mesh
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY - px(3), w: DEVICE_WIDTH, h: px(6),
      color: 0xAAAAAA // Grey Mesh
    })

    // 3. Net Top Tape
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY - px(2), w: DEVICE_WIDTH, h: px(4),
      color: 0xffffff // White Tape
    })

    // 4. Net Posts
    const postW = px(12)
    const postH = px(12)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY - (postH / 2), w: postW, h: postH, color: 0x888888, radius: px(6)
    })
    group.createWidget(widget.FILL_RECT, {
      x: DEVICE_WIDTH - postW, y: netY - (postH / 2), w: postW, h: postH, color: 0x888888, radius: px(6)
    })

    // COURT MARKINGS (REALISTIC BOXES)
    const shortLineDist = px(70) // Distance from Net
    const sideMargin = px(30)    // Doubles Alley Width

    // A. Side Tramlines (Full Height)
    // Left
    group.createWidget(widget.FILL_RECT, {
      x: sideMargin, y: 0, w: 2, h: DEVICE_HEIGHT, color: 0xdddddd
    })
    // Right
    group.createWidget(widget.FILL_RECT, {
      x: DEVICE_WIDTH - sideMargin, y: 0, w: 2, h: DEVICE_HEIGHT, color: 0xdddddd
    })

    // B. Short Service Lines (Horizontal)
    // Top (Opponent)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY - shortLineDist, w: DEVICE_WIDTH, h: 2, color: 0xdddddd
    })
    // Bottom (Me)
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: netY + shortLineDist, w: DEVICE_WIDTH, h: 2, color: 0xdddddd
    })

    // C. Center Lines (Vertical - Only in Service Courts)
    // Top Center (From Top Edge to Short Service Line)
    group.createWidget(widget.FILL_RECT, {
      x: (DEVICE_WIDTH / 2) - 1, y: 0, w: 2, h: netY - shortLineDist, color: 0xffffff
    })
    // Bottom Center (From Bottom Edge to Short Service Line)
    group.createWidget(widget.FILL_RECT, {
      x: (DEVICE_WIDTH / 2) - 1, y: netY + shortLineDist, w: 2, h: (DEVICE_HEIGHT - (netY + shortLineDist)), color: 0xffffff
    })

    // Scores (Badges)
    // Stick to Top and Bottom
    const badgeW = px(140)
    const badgeH = px(90)
    const badgeX = (DEVICE_WIDTH - badgeW) / 2

    // Top Score Badge (Opponent)
    // Padded slightly for round screen safety
    const topBadgeY = px(20)
    group.createWidget(widget.FILL_RECT, {
      x: badgeX, y: topBadgeY, w: badgeW, h: badgeH,
      color: 0x000000, alpha: 100, radius: px(20)
    })
    this.scoreAWidget = group.createWidget(widget.TEXT, {
      x: badgeX, y: topBadgeY, w: badgeW, h: badgeH,
      text_size: px(50), color: 0xffffff,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.WRAP,
      text: '0'
    })

    // Bottom Score Badge (Me)
    const bottomBadgeY = DEVICE_HEIGHT - badgeH - px(20)
    group.createWidget(widget.FILL_RECT, {
      x: badgeX, y: bottomBadgeY, w: badgeW, h: badgeH,
      color: 0x000000, alpha: 100, radius: px(20)
    })
    this.scoreBWidget = group.createWidget(widget.TEXT, {
      x: badgeX, y: bottomBadgeY, w: badgeW, h: badgeH,
      text_size: px(50), color: 0xffffff,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.WRAP,
      text: '0'
    })

    // STREAK ICONS (Lightning Bolt) - Hidden by default
    const streakSize = px(30)
    // Top Icon (To the Left of Top Badge?)
    // BadgeX is centered. 
    this.streakAWidget = group.createWidget(widget.TEXT, {
      x: badgeX - streakSize - px(10), y: topBadgeY + (badgeH - streakSize) / 2, w: streakSize, h: streakSize,
      text_size: px(24), color: 0xFFFF00, // Yellow
      text: '⚡️'
    })
    this.streakAWidget.setProperty(prop.VISIBLE, false)

    // Bottom Icon (To the Left of Bottom Badge)
    this.streakBWidget = group.createWidget(widget.TEXT, {
      x: badgeX - streakSize - px(10), y: bottomBadgeY + (badgeH - streakSize) / 2, w: streakSize, h: streakSize,
      text_size: px(24), color: 0xFFFF00,
      text: '⚡️'
    })
    this.streakBWidget.setProperty(prop.VISIBLE, false)

    // Server Icon Group (Background + Icon)
    // We need to move both, so we'll init them here but control position in updateGameUI

    // Background Circle (White Glow)
    const iconSize = px(46)
    this.serverIconBgWidget = group.createWidget(widget.FILL_RECT, {
      x: 0, y: 0, w: iconSize, h: iconSize,
      color: 0xffffff, radius: iconSize / 2
    })

    // Racket Icon
    this.serverIconWidget = group.createWidget(widget.TEXT, {
      x: 0, y: 0, w: iconSize, h: iconSize,
      text_size: px(30), color: 0x000000,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: '🏸'
    })

    // Touch Zones
    const zoneA = group.createWidget(widget.IMG, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT / 2, src: ''
    })
    zoneA.addEventListener(event.CLICK_DOWN, () => { this.handleZoneTap(0) })

    const zoneB = group.createWidget(widget.IMG, {
      x: 0, y: DEVICE_HEIGHT / 2, w: DEVICE_WIDTH, h: DEVICE_HEIGHT / 2, src: ''
    })
    zoneB.addEventListener(event.CLICK_DOWN, () => { this.handleZoneTap(1) })

    this.state.screens[1] = group
  },

  recreateGameScreen() {
    // Quick way to update labels: remove and recreate
    if (this.state.screens[1]) {
      // In ZeppOS, removing widgets from a group is tricky individually
      // but we can just hide the old group and make a new one, or just update labels if we stored them.
      // For simplicity in this fast iteration: I'll just redraw Screen 2 and swap it in the array.
      // Ideally we'd delete the old widget, but memory constraints might bite.
      // BETTER: Just hide the old group?
      this.state.screens[1].setProperty(prop.VISIBLE, false)
      this.createScreen2()
      this.state.screens[1].setProperty(prop.VISIBLE, true)
    }
  },

  handleZoneTap(playerIndex) {
    const now = Date.now()
    if (playerIndex === this.state.lastTapZone && (now - this.state.lastTapTime < 400)) {
      this.incrementScore(playerIndex)
      this.state.lastTapTime = 0
      this.state.lastTapZone = -1
    } else {
      this.state.lastTapTime = now
      this.state.lastTapZone = playerIndex
    }
  },

  incrementScore(winnerIndex) {
    // Streak Logic
    // If same winner as last point (and it wasn't a fresh start)
    // We need to know who won the LAST point. 
    // In our logic, `this.state.server` holds who is serving NOW.
    // Assuming winner serves: If `this.state.server` == `winnerIndex`, then they won the LAST point too.

    // Correction: In incrementScore, we are ABOUT to update. 
    // So `this.state.server` IS the person who served for THIS point.
    // If they win, they keep serve. So `server` matches `winnerIndex`. Streak continues.
    // If they lose, serve changes. Streak resets.

    // BUT checking `server` is tricky if we just started.
    // Better: Rely on our explicit streak tracking.

    if (this.state.streak.player === winnerIndex) {
      this.state.streak.count++
    } else {
      // New winner takes momentum
      this.state.streak.player = winnerIndex
      this.state.streak.count = 1
    }

    this.state.scores[winnerIndex]++
    this.state.server = winnerIndex
    this.updateGameUI()
    this.saveConfig()
  },

  updateGameUI() {
    if (this.scoreAWidget) this.scoreAWidget.setProperty(prop.TEXT, this.state.scores[0].toString())
    if (this.scoreBWidget) this.scoreBWidget.setProperty(prop.TEXT, this.state.scores[1].toString())

    // Update Streak Icons
    // Threshold: 2 consecutive points
    const STREAK_THRESHOLD = 2
    if (this.streakAWidget) {
      const show = (this.state.streak.player === 0 && this.state.streak.count >= STREAK_THRESHOLD)
      this.streakAWidget.setProperty(prop.VISIBLE, show)
    }
    if (this.streakBWidget) {
      const show = (this.state.streak.player === 1 && this.state.streak.count >= STREAK_THRESHOLD)
      this.streakBWidget.setProperty(prop.VISIBLE, show)
    }

    if (this.serverIconWidget && this.serverIconBgWidget) {
      const serverIndex = this.state.server // 0 (Top) or 1 (Bottom)
      const serverScore = this.state.scores[serverIndex]
      const isEven = (serverScore % 2 === 0)

      // Center in the Service Box
      // Calculation:
      // X: Quarter Width (Left) or 3/4 Width (Right)
      // Y: Quarter Height (Top) or 3/4 Height (Bottom) relative to court half?
      // Actually, we want it explicitly in the service box area.

      const iconSize = px(46)

      let posY = 0
      if (serverIndex === 0) {
        // Top Player (Opp)
        // Box is from Net (Center) to Short Service Line? NO, Service box is Back.
        // In Badminton:
        // Singles Serve Box: From Short Service Line to Back Boundary.
        // Doubles Serve Box: From Short Service Line to Long Service Line (Inner Back).
        // We assume Singles mostly. 
        // Center of "Back Area" roughly.
        posY = (DEVICE_HEIGHT / 4) - (iconSize / 2)
      } else {
        // Bottom Player (Me)
        posY = (3 * DEVICE_HEIGHT / 4) - (iconSize / 2)
      }


      // Determine X Center (Left or Right Quadrant)
      // Badminton Rule: Even Score -> Serve from Right Court. Odd -> Left Court.
      // Perspective:
      // Bottom Player (1): Right Court is Screen-Right. Left Court is Screen-Left.
      // Top Player (0): Facing us/net. Right Court is Screen-Left. Left Court is Screen-Right.

      let posX = 0

      if (serverIndex === 1) { // Bottom
        posX = isEven
          ? (3 * DEVICE_WIDTH / 4) - (iconSize / 2) // Right
          : (DEVICE_WIDTH / 4) - (iconSize / 2)     // Left
      } else { // Top
        posX = isEven
          ? (DEVICE_WIDTH / 4) - (iconSize / 2)     // Screen-Left (Their Right)
          : (3 * DEVICE_WIDTH / 4) - (iconSize / 2) // Screen-Right (Their Left)
      }

      this.serverIconWidget.setProperty(prop.X, posX)
      this.serverIconWidget.setProperty(prop.Y, posY)

      this.serverIconBgWidget.setProperty(prop.X, posX)
      this.serverIconBgWidget.setProperty(prop.Y, posY)
    }
  },

  createScreen3() {
    const group = createWidget(widget.GROUP, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT
    })

    // Background to cover system artifacts
    group.createWidget(widget.FILL_RECT, {
      x: 0, y: 0, w: DEVICE_WIDTH, h: DEVICE_HEIGHT,
      color: 0x000000
    })

    // Content Dimensions (3 Buttons @ 50, 2 Toggles @ 40, Spacing)
    const btnH = 50
    const spacer = 15
    const toggleH = 40
    const totalH = (btnH * 3) + (spacer * 2) + (spacer) + (toggleH * 2) + spacer

    const maxW = DEVICE_WIDTH * 0.8
    const startX = (DEVICE_WIDTH - maxW) / 2
    let y = (DEVICE_HEIGHT - totalH) / 2 // Vertically Center

    this.createButton(group, startX, y, maxW, btnH, 'New Match', () => this.resetMatch('new'))
    y += btnH + spacer

    this.createButton(group, startX, y, maxW, btnH, 'Reset Game', () => this.resetMatch('current'))
    y += btnH + spacer

    this.createButton(group, startX, y, maxW, btnH, 'Reset Stats', () => this.resetMatch('all'))
    y += btnH + spacer + 10 // Extra space before settings

    this.createToggle(group, startX, y, maxW, toggleH, 'Sound', this.state.settings.sound)
    y += toggleH + 10
    this.createToggle(group, startX, y, maxW, toggleH, 'Haptics', this.state.settings.haptic)

    this.state.screens[2] = group
  },

  createButton(group, x, y, w, h, text, callback) {
    group.createWidget(widget.BUTTON, {
      x, y, w, h,
      text,
      color: 0xffffff,
      normal_color: 0x333333,
      press_color: 0x555555,
      radius: 12,
      click_func: callback
    })
  },

  createToggle(group, x, y, w, h, text, isActive) {
    group.createWidget(widget.TEXT, {
      x, y, w, h,
      text: `${text}: ${isActive ? 'ON' : 'OFF'}`,
      color: 0xaaaaaa,
      text_size: 20
    })
  },

  initConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('shuttlestat_data') // Changed key to generic
        if (stored) {
          const data = JSON.parse(stored)

          // Restore full state
          if (data.matchStats) this.state.matchStats = data.matchStats
          if (data.scores) this.state.scores = data.scores
          if (data.server !== undefined) this.state.server = data.server
          if (data.setupComplete !== undefined) this.state.setupComplete = data.setupComplete
          if (data.startingServer !== undefined) this.state.startingServer = data.startingServer
          if (data.userSide !== undefined) this.state.userSide = data.userSide

          console.log('State Restored:', JSON.stringify(data))
        }
      }
    } catch (e) {
      console.log('Storage Error', e)
    }
  },

  saveConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = {
          matchStats: this.state.matchStats,
          scores: this.state.scores,
          server: this.state.server,
          setupComplete: this.state.setupComplete,
          startingServer: this.state.startingServer,
          userSide: this.state.userSide
        }
        localStorage.setItem('shuttlestat_data', JSON.stringify(data))
        // console.log('State Saved')
      }
    } catch (e) { }
  },

  // ... Sensors ...

  resetMatch(type) {
    if (type === 'new') {
      // End current match, update stats, reset score, KEEP setup
      this.state.matchStats.matches++
      // Determine winner
      if (this.state.scores[0] !== this.state.scores[1]) {
        // If User (1/Bottom) has higher score
        if (this.state.scores[1] > this.state.scores[0]) {
          this.state.matchStats.wins++
        }
      }
      this.state.scores = [0, 0]
      // Reset server to starting server? Or winner serves?
      // Simple: Reset to original starting server setting
      this.state.server = this.state.startingServer

    } else if (type === 'new_setup') {
      // CALL FROM START DIALOG -> NEW MATCH
      // Finalize previous match if scores exist
      if (this.state.scores[0] > 0 || this.state.scores[1] > 0) {
        this.state.matchStats.matches++
        if (this.state.scores[1] > this.state.scores[0]) {
          this.state.matchStats.wins++
        }
      }
      // Prepare for fresh setup
      this.state.scores = [0, 0]
      this.state.streak = { count: 0, player: -1 } // Reset Streak
      this.state.setupComplete = false

    } else if (type === 'current') {
      // Just reset points, keep everything else
      this.state.scores = [0, 0]
      this.state.streak = { count: 0, player: -1 } // Reset Streak
      this.state.server = this.state.startingServer

    } else if (type === 'all') {
      // Factory Reset
      this.state.matchStats = { matches: 0, wins: 0 }
      this.state.scores = [0, 0]
      this.state.streak = { count: 0, player: -1 } // Reset Streak
      this.state.setupComplete = false // FORCE SETUP AGAIN
      this.state.showSplash = false // Maybe show splash? No, just restart UI

      // We need to re-show setup modal if we are currently on game screen
      // But simple way: reload or let user navigate.
      // Since setup is modal, let's just create it immediately?
      if (!this.setupModal || this.setupModal.getProperty(prop.VISIBLE) === false) {
        this.createSetupModal()
        // Ensure setup modal is visible
        if (this.setupModal) this.setupModal.setProperty(prop.VISIBLE, true)
      }
    }

    this.updateGameUI()
    this.updateStatsUI()
    this.saveConfig() // Immediate save
  }
})
