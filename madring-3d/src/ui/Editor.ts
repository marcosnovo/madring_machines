/**
 * The live tuning panel, on the `.` key (listed as "Tuning" on the intro
 * screen's key list).
 *
 * Everything here writes straight into src/vehicle/tuning.ts, which the car
 * controller and the camera read every tick — so every slider is felt without
 * a rebuild, a reload or even a respawn. Changes persist to localStorage;
 * `reset tuning` puts the shipped defaults back. The defaults are the APEX
 * FORMULA 2026 car (see NOTICE).
 */
import { button, folder, useControls } from 'leva'
import { useStore } from '../store'
import { resetTuning, setTuning, tuning, TUNING_DEFAULTS } from '../vehicle/tuning'

export function Editor() {
  const [set, dpr, shadows] = useStore((state) => [state.set, state.dpr, state.shadows])

  const [, setPanel] = useControls(() => ({
    Performance: folder(
      {
        dpr: { value: dpr, min: 1, max: 2, step: 0.5, onChange: (v: number) => set({ dpr: v }) },
        shadows: { value: shadows, onChange: (v: boolean) => set({ shadows: v }) },
      },
      { collapsed: true },
    ),
    Car: folder({
      mass: { value: tuning.mass, min: 500, max: 1500, step: 10, onChange: (v: number) => setTuning({ mass: v }) },
      powerKW: { value: tuning.power / 1e3, min: 200, max: 1000, step: 5, onChange: (v: number) => setTuning({ power: v * 1e3 }) },
      boostKW: { value: tuning.boostPower / 1e3, min: 0, max: 500, step: 5, onChange: (v: number) => setTuning({ boostPower: v * 1e3 }) },
      mu: { value: tuning.mu, min: 0.6, max: 2.6, step: 0.02, onChange: (v: number) => setTuning({ mu: v }) },
      downforceCLA: { value: tuning.claZ, min: 0, max: 7, step: 0.1, onChange: (v: number) => setTuning({ claZ: v }) },
      dragCDA: { value: tuning.cdaZ, min: 0.4, max: 3, step: 0.05, onChange: (v: number) => setTuning({ cdaZ: v }) },
      rollDrag: { value: tuning.rollDrag, min: 0, max: 800, step: 10, onChange: (v: number) => setTuning({ rollDrag: v }) },
      cornerStiffness: { value: tuning.cornerStiffness, min: 20000, max: 160000, step: 1000, onChange: (v: number) => setTuning({ cornerStiffness: v }) },
      frontGripBias: { value: tuning.frontCornerScale, min: 0.6, max: 1.1, step: 0.01, onChange: (v: number) => setTuning({ frontCornerScale: v }) },
      yawInertia: { value: tuning.yawInertia, min: 400, max: 2500, step: 20, onChange: (v: number) => setTuning({ yawInertia: v }) },
    }),
    Steering: folder(
      {
        lockFloor: { value: tuning.steerLow, min: 0, max: 0.2, step: 0.005, onChange: (v: number) => setTuning({ steerLow: v }) },
        lockGain: { value: tuning.steerGain, min: 0.1, max: 0.8, step: 0.01, onChange: (v: number) => setTuning({ steerGain: v }) },
        speedFalloff: { value: tuning.steerFalloff, min: 0.02, max: 0.2, step: 0.005, onChange: (v: number) => setTuning({ steerFalloff: v }) },
        lockCap: { value: tuning.steerMax, min: 0.2, max: 0.6, step: 0.01, onChange: (v: number) => setTuning({ steerMax: v }) },
        keyAttack: { value: tuning.steerAttack, min: 2, max: 16, step: 0.5, onChange: (v: number) => setTuning({ steerAttack: v }) },
        keyReturn: { value: tuning.steerReturn, min: 2, max: 24, step: 0.5, onChange: (v: number) => setTuning({ steerReturn: v }) },
      },
      { collapsed: true },
    ),
    Gamepad: folder(
      {
        deadzone: { value: tuning.padDeadzone, min: 0, max: 0.4, step: 0.01, onChange: (v: number) => setTuning({ padDeadzone: v }) },
        curve: { value: tuning.padCurve, min: 1, max: 3, step: 0.05, onChange: (v: number) => setTuning({ padCurve: v }) },
      },
      { collapsed: true },
    ),
    Assists: folder(
      {
        tractionControl: { value: tuning.tc, onChange: (v: boolean) => setTuning({ tc: v }) },
        abs: { value: tuning.abs, onChange: (v: boolean) => setTuning({ abs: v }) },
        autoGear: { value: tuning.autoGear, onChange: (v: boolean) => setTuning({ autoGear: v }) },
        stability: { value: tuning.stability, onChange: (v: boolean) => setTuning({ stability: v }) },
      },
      { collapsed: true },
    ),
    Handbrake: folder(
      {
        force: { value: tuning.handbrakeForce, min: 0, max: 25000, step: 500, onChange: (v: number) => setTuning({ handbrakeForce: v }) },
        rearGrip: { value: tuning.handbrakeGrip, min: 0.3, max: 1, step: 0.02, onChange: (v: number) => setTuning({ handbrakeGrip: v }) },
      },
      { collapsed: true },
    ),
    Camera: folder(
      {
        fovBase: { value: tuning.fovBase, min: 40, max: 90, step: 1, onChange: (v: number) => setTuning({ fovBase: v }) },
        fovSpeed: { value: tuning.fovSpeed, min: 0, max: 40, step: 1, onChange: (v: number) => setTuning({ fovSpeed: v }) },
        fovBoost: { value: tuning.fovBoost, min: 0, max: 25, step: 1, onChange: (v: number) => setTuning({ fovBoost: v }) },
        lag: { value: tuning.cameraEase, min: 1, max: 20, step: 0.5, onChange: (v: number) => setTuning({ cameraEase: v }) },
        shake: { value: tuning.shake, min: 0, max: 4, step: 0.1, onChange: (v: number) => setTuning({ shake: v }) },
      },
      { collapsed: true },
    ),
    Attitude: folder(
      {
        pitchGain: { value: tuning.attPitch, min: 0, max: 0.004, step: 0.0001, onChange: (v: number) => setTuning({ attPitch: v }) },
        rollGain: { value: tuning.attRoll, min: 0, max: 0.004, step: 0.0001, onChange: (v: number) => setTuning({ attRoll: v }) },
      },
      { collapsed: true },
    ),
    'reset tuning': button(() => {
      resetTuning()
      // push the defaults back into the panel widgets; the `never` cast is
      // because leva's setter types do not understand values inside folders
      setPanel({
        mass: TUNING_DEFAULTS.mass,
        powerKW: TUNING_DEFAULTS.power / 1e3,
        boostKW: TUNING_DEFAULTS.boostPower / 1e3,
        mu: TUNING_DEFAULTS.mu,
        downforceCLA: TUNING_DEFAULTS.claZ,
        dragCDA: TUNING_DEFAULTS.cdaZ,
        rollDrag: TUNING_DEFAULTS.rollDrag,
        cornerStiffness: TUNING_DEFAULTS.cornerStiffness,
        frontGripBias: TUNING_DEFAULTS.frontCornerScale,
        yawInertia: TUNING_DEFAULTS.yawInertia,
        lockFloor: TUNING_DEFAULTS.steerLow,
        lockGain: TUNING_DEFAULTS.steerGain,
        speedFalloff: TUNING_DEFAULTS.steerFalloff,
        lockCap: TUNING_DEFAULTS.steerMax,
        keyAttack: TUNING_DEFAULTS.steerAttack,
        keyReturn: TUNING_DEFAULTS.steerReturn,
        deadzone: TUNING_DEFAULTS.padDeadzone,
        curve: TUNING_DEFAULTS.padCurve,
        tractionControl: TUNING_DEFAULTS.tc,
        abs: TUNING_DEFAULTS.abs,
        autoGear: TUNING_DEFAULTS.autoGear,
        stability: TUNING_DEFAULTS.stability,
        force: TUNING_DEFAULTS.handbrakeForce,
        rearGrip: TUNING_DEFAULTS.handbrakeGrip,
        fovBase: TUNING_DEFAULTS.fovBase,
        fovSpeed: TUNING_DEFAULTS.fovSpeed,
        fovBoost: TUNING_DEFAULTS.fovBoost,
        lag: TUNING_DEFAULTS.cameraEase,
        shake: TUNING_DEFAULTS.shake,
        pitchGain: TUNING_DEFAULTS.attPitch,
        rollGain: TUNING_DEFAULTS.attRoll,
      } as never)
    }),
  }))
  return null
}
