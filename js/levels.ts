// These Level classes store parameters governing the behavior of
// the World in different levels. (A more accurate name for the
// class might be LevelParams.)
//
// It might have made more sense to make all of the properties
// of these Level objects static, or to make the individual levels
// instances of Level rather than subclasses. But I ran into some
// Typescript issues, and this was the easiest.

export abstract class Level {
  // The number of creatures at the beginning.
  readonly numCreatures: number;

  // Half the width of a wall.
  readonly wallHalfWidth: number = 5;

  readonly pointCircleFactor: number = 0.5;

  // Returns the radius of a new creature to be created. The value
  // may vary from one invocation to the next.
  abstract creatureRadius(): number;
}

export class Level1 extends Level {
  readonly numCreatures = 200;
  creatureRadius(): number {
    return Math.random() * 5 + 4;
  }
}

export class Level2 extends Level {
  readonly numCreatures = 5;
  readonly wallHalfWidth = 13;
  creatureRadius(): number {
    return Math.random() * 15 + 12;
  }
}
