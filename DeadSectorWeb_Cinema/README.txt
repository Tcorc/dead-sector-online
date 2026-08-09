DEAD SECTOR WEB V12 - FIXES

FIXED WEAPON SWAPPING
- PC: Q swaps between weapon slot 1 and weapon slot 2.
- Xbox: Y swaps weapons.
- Mobile: SWAP button remains supported.
- Swap now forces an immediate server state update.
- Ammo/reserve are saved correctly for each slot.
- Mystery Box fills empty slot first; when both are full it replaces the active slot.

FIXED 3-LEVEL WEAPON UPGRADE
- Level 1: 5,000 points
- Level 2: 15,000 points
- Level 3: 30,000 points
- Machine stays interactable after Level 1.
- HUD/prompt reads the upgrade level for the CURRENT active weapon slot.
- Each of the two carried weapons has its own separate upgrade level.
- Server sends next level / next price after every successful upgrade.
- Level III reports MAX.

FIXED POWER-UP SPAM
- Power-ups can no longer drop back-to-back.
- Minimum 18-second cooldown between successful drops.
- At least 10 zombie kills are required before another drop can roll.
- Chance rises gradually as more zombies are killed without a drop.
- Weighted rarity:
  Max Ammo ~42% of successful drops
  Double Points ~30%
  Insta-Kill ~20%
  Nuke ~8%
- This should make drops feel useful without flooding the map.

All other V11 co-op, wall-buy, teammate, multiplayer, perk and gameplay features remain.

ONLINE UPDATE:
Upload this V12 folder to GitHub and point Render's Root Directory to it, or replace the contents of your current V11 folder.
