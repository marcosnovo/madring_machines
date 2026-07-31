/**
 * The AI cars. Same glb, same `prepare` finishing as the player's Chassis —
 * each clone gets its driver's paint — posed every frame straight from its
 * CarController (position, heading, road pitch/roll from the sample's
 * measured grade/cross-slope, wheel spin and steer).
 *
 * Cost: one clone of the ~28 k-triangle car per driver. No per-frame
 * allocation; shadows only from the silhouette parts, exactly like the player
 * car. AI cars beyond SHADOW_RANGE of the camera stop casting shadows —
 * the sun's 170 m shadow frustum follows the player, so a car two corners
 * away can never land in it anyway.
 */
import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { Group, Object3D } from 'three'

import { asset } from '../../assets'
import { DRACO_PATH } from '../../draco'
import { getRace } from '../../race/RaceSession'
import { getPlayer } from '../../vehicle/CarController'
import { getTrackFrame, surfaceY } from '../../circuit/trackFrame'
import { prepare } from './Chassis'
import type { CarParts } from './Chassis'

const SHADOW_RANGE_SQ = 120 * 120

export function OpponentCars(): JSX.Element {
  const { scene } = useGLTF(asset('models/f1car-2026.glb'), DRACO_PATH)
  const race = getRace()
  const aiEntries = useMemo(() => race.entries.filter((entry) => !entry.isPlayer), [race])

  const parts = useMemo<CarParts[]>(
    () =>
      aiEntries.map((entry) => {
        const p = prepare(scene as Group)
        p.bodyMaterial?.color.set(entry.spec.color)
        // The AI has no brake-glow / rain-light animation; hide the emitters.
        for (const glow of p.brakeGlows) glow.visible = false
        if (p.rainLight) p.rainLight.visible = false
        return p
      }),
    [scene, aiEntries],
  )
  const groups = useRef<(Group | null)[]>([])
  const spin = useRef<Float32Array>(new Float32Array(aiEntries.length * 4))
  // The meshes prepare() marked as shadow casters, per car, so the range
  // toggle below flips exactly those and nothing else.
  const casters = useRef<Object3D[][]>([])
  if (casters.current.length !== parts.length) {
    casters.current = parts.map((p) => {
      const list: Object3D[] = []
      p.root.traverse((o: Object3D) => {
        if (o.castShadow) list.push(o)
      })
      return list
    })
  }

  useFrame((state, delta) => {
    const track = getTrackFrame()
    const player = getPlayer()
    for (let i = 0; i < aiEntries.length; i++) {
      const group = groups.current[i]
      if (!group) continue
      const car = aiEntries[i].car
      const sample = track.samples[car.sampleIdx]
      const y = surfaceY(track, car.x, car.z, car.sampleIdx)
      group.position.set(car.x, y + 0.02, car.z)
      group.rotation.order = 'YXZ'
      // Grade/cross-slope are the measured surface angles at the sample; for
      // a car roughly aligned with the road they are the probe result at a
      // quarter of the cost.
      group.rotation.set(-Math.asin(sample.grade), car.heading, Math.atan(sample.latSlope))

      const p = parts[i]
      p.body.rotation.x = car.pitch
      p.body.rotation.z = car.roll
      for (let w = 0; w < 4; w++) {
        const wheel = p.wheelObjects[w]
        if (!wheel) continue
        let angle = spin.current[i * 4 + w] + car.vehicle.wheels[w].omega * delta
        if (angle > Math.PI * 2) angle -= Math.PI * 2
        if (angle < 0) angle += Math.PI * 2
        spin.current[i * 4 + w] = angle
        wheel.rotation.y = w < 2 ? car.roadWheelAngle : 0
        wheel.rotation.x = angle
      }

      const dx = car.x - player.x
      const dz = car.z - player.z
      const near = dx * dx + dz * dz < SHADOW_RANGE_SQ
      if (group.userData.shadows !== near) {
        group.userData.shadows = near
        for (const mesh of casters.current[i] ?? []) mesh.castShadow = near
      }
    }
  })

  return (
    <group>
      {aiEntries.map((entry, i) => (
        <group key={entry.spec.name} ref={(g) => (groups.current[i] = g)} dispose={null}>
          <primitive object={parts[i].body} />
          {parts[i].wheelObjects.map((o, w) => (
            <primitive key={w} object={o} />
          ))}
        </group>
      ))}
    </group>
  )
}

useGLTF.preload(asset('models/f1car-2026.glb'), DRACO_PATH)
