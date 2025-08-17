import { describe, expect, it } from "bun:test";

import { Either, Maybe, Result } from "./monad.js";

describe("Maybe", () => {
  describe("of", () => {
    it("should create a Maybe with a value", () => {
      const value = 42;
      const maybe = Maybe.of(value);

      expect(maybe.isSome).toBe(true);
      expect(maybe.valueOr(null)).toBe(value);
    });
  });

  describe("ofFalsy", () => {
    it("should create an empty Maybe for a falsy value", () => {
      const value = 0;
      const maybe = Maybe.ofFalsy(value);

      expect(maybe.isSome).toBe(false);
      expect(maybe.valueOr(42)).toBe(42);
    });
  });

  describe("valueOr", () => {
    it("should return the default value if Maybe is empty", () => {
      const maybe = new Maybe<number>();
      const defaultValue = 42;

      expect(maybe.valueOr(defaultValue)).toBe(defaultValue);
    });
  });

  describe("map", () => {
    it("should apply the function to the value of Maybe", () => {
      const value = 21;
      const maybe = Maybe.of(value);
      const mapped = maybe.map((x) => x * 2);

      expect(mapped.isSome).toBe(true);
      expect(mapped.valueOr(null)).toBe(value * 2);
    });
  });

  describe("mapOr", () => {
    it("should apply the function to the value of Maybe or return the default value", () => {
      const value = 21;
      const defaultValue = 84;
      const maybe = Maybe.of(value);
      const mapped = maybe.mapOr(defaultValue, (x) => x * 2);

      expect(mapped).toBe(value * 2);
    });
  });

  describe("mapOrUndefined", () => {
    it("should apply the function to the value of Maybe or return undefined", () => {
      const value = 21;
      const maybe = Maybe.of(value);
      const mapped = maybe.mapOrUndefined((x) => x * 2);

      expect(mapped).toBe(value * 2);
    });
  });

  describe("mapOrNull", () => {
    it("should apply the function to the value of Maybe or return null", () => {
      const value = 21;
      const maybe = Maybe.of(value);
      const mapped = maybe.mapOrNull((x) => x * 2);

      expect(mapped).toBe(value * 2);
    });
  });

  describe("empty", () => {
    it("should create an empty Maybe with various map operations", () => {
      const maybe = new Maybe<number>();

      expect(maybe.isSome).toBe(false);
      expect(maybe.valueOr(42)).toBe(42);
      expect(maybe.map((x) => x * 2).isSome).toBe(false);
      expect(maybe.mapOr(84, (x) => x * 2)).toBe(84);
      expect(maybe.mapOrUndefined((x) => x * 2)).toBeUndefined();
      expect(maybe.mapOrNull((x) => x * 2)).toBeNull();
    });
  });
});

describe("Either", () => {
  describe("left", () => {
    it("should create a left Either", () => {
      const error = "Something went wrong";
      const either = Either.left(error);

      expect(either.isLeft()).toBe(true);
      expect(either.isRight()).toBe(false);
      expect(either.left()).toBe(error);
      expect(either.right()).toBeUndefined();
    });
  });

  describe("right", () => {
    it("should create a right Either", () => {
      const value = 42;
      const either = Either.right(value);

      expect(either.isLeft()).toBe(false);
      expect(either.isRight()).toBe(true);
      expect(either.left()).toBeUndefined();
      expect(either.right()).toBe(value);
    });
  });

  describe("map", () => {
    it("should map over right value", () => {
      const value = 21;
      const either = Either.right<never, number>(value);
      const mapped = either.map((x: number) => x * 2);

      expect(mapped.isRight()).toBe(true);
      expect(mapped.right()).toBe(42);
    });

    it("should not map over left value", () => {
      const error = "Error";
      const either = Either.left<string, number>(error);
      const mapped = either.map((_x: number) => 0);

      expect(mapped.isLeft()).toBe(true);
      expect(mapped.left()).toBe(error);
    });
  });

  describe("mapLeft", () => {
    it("should map over left value", () => {
      const error = "Error";
      const either = Either.left(error);
      const mapped = either.mapLeft((e) => `Mapped: ${e}`);

      expect(mapped.isLeft()).toBe(true);
      expect(mapped.left()).toBe("Mapped: Error");
    });

    it("should not map over right value", () => {
      const value = 42;
      const either = Either.right(value);
      const mapped = either.mapLeft((e) => `Mapped: ${e}`);

      expect(mapped.isRight()).toBe(true);
      expect(mapped.right()).toBe(value);
    });
  });

  describe("flatMap", () => {
    it("should flatMap over right value", () => {
      const value = 21;
      const either = Either.right<never, number>(value);
      const flatMapped = either.flatMap((x: number) =>
        Either.right<never, number>(x * 2),
      );

      expect(flatMapped.isRight()).toBe(true);
      expect(flatMapped.right()).toBe(42);
    });

    it("should not flatMap over left value", () => {
      const error = "Error";
      const either = Either.left<string, number>(error);
      const flatMapped = either.flatMap((_x: number) =>
        Either.right<never, number>(0),
      );

      expect(flatMapped.isLeft()).toBe(true);
      expect(flatMapped.left()).toBe(error);
    });

    it("should handle flatMap that returns left", () => {
      const value = 21;
      const either = Either.right<never, number>(value);
      const flatMapped = either.flatMap((_x: number) =>
        Either.left<string, number>("FlatMap error"),
      );

      expect(flatMapped.isLeft()).toBe(true);
      expect(flatMapped.left()).toBe("FlatMap error");
    });
  });

  describe("fold", () => {
    it("should fold left value", () => {
      const error = "Error";
      const either = Either.left(error);
      const result = either.fold(
        (e) => `Left: ${e}`,
        (v) => `Right: ${v}`,
      );

      expect(result).toBe("Left: Error");
    });

    it("should fold right value", () => {
      const value = 42;
      const either = Either.right(value);
      const result = either.fold(
        (e) => `Left: ${e}`,
        (v) => `Right: ${v}`,
      );

      expect(result).toBe("Right: 42");
    });
  });

  describe("value", () => {
    it("should return the underlying value", () => {
      const leftValue = "Error";
      const rightValue = 42;

      const leftEither = Either.left(leftValue);
      const rightEither = Either.right(rightValue);

      expect(leftEither.value()).toBe(leftValue);
      expect(rightEither.value()).toBe(rightValue);
    });
  });
});

describe("Result", () => {
  describe("ok", () => {
    it("should create a successful Result", () => {
      const value = 42;
      const result = Result.ok(value);

      expect(result.isRight()).toBe(true);
      expect(result.isLeft()).toBe(false);
      expect(result.ok()).toBe(value);
      expect(result.error()).toBeUndefined();
    });
  });

  describe("error", () => {
    it("should create an error Result", () => {
      const error = "Something went wrong";
      const result = Result.error(error);

      expect(result.isRight()).toBe(false);
      expect(result.isLeft()).toBe(true);
      expect(result.ok()).toBeUndefined();
      expect(result.error()).toBe(error);
    });
  });

  describe("fromEither", () => {
    it("should create Result from Either.right", () => {
      const value = 42;
      const either = Either.right(value);
      const result = Result.fromEither(either);

      expect(result.isRight()).toBe(true);
      expect(result.ok()).toBe(value);
    });

    it("should create Result from Either.left", () => {
      const error = "Error";
      const either = Either.left(error);
      const result = Result.fromEither(either);

      expect(result.isLeft()).toBe(true);
      expect(result.error()).toBe(error);
    });
  });

  describe("fromPromise", () => {
    it("should create successful Result from resolved promise", async () => {
      const value = 42;
      const promise = Promise.resolve(value);
      const result = await Result.fromPromise(promise);

      expect(result.isRight()).toBe(true);
      expect(result.ok()).toBe(value);
    });

    it("should create error Result from rejected promise", async () => {
      const error = new Error("Promise rejected");
      const promise = Promise.reject(error);
      const result = await Result.fromPromise(promise);

      expect(result.isLeft()).toBe(true);
      expect(result.error()).toBe(error);
    });
  });

  describe("mapError", () => {
    it("should map over error value", () => {
      const error = "Original error";
      const result = Result.error(error);
      const mapped = result.mapError((e) => `Mapped: ${e}`);

      expect(mapped.isLeft()).toBe(true);
      expect(mapped.error()).toBe("Mapped: Original error");
    });

    it("should not map over success value", () => {
      const value = 42;
      const result = Result.ok(value);
      const mapped = result.mapError((e) => `Mapped: ${e}`);

      expect(mapped.isRight()).toBe(true);
      expect(mapped.ok()).toBe(value);
    });
  });

  describe("flatMap", () => {
    it("should flatMap over success value", () => {
      const value = 21;
      const result = Result.ok<number, string>(value);
      const flatMapped = result.flatMap((x: number) =>
        Either.right<never, number>(x * 2),
      );

      expect(flatMapped.isRight()).toBe(true);
      expect(flatMapped.right()).toBe(42);
    });

    it("should not flatMap over error value", () => {
      const error = "Error";
      const result = Result.error<number, string>(error);
      const flatMapped = result.flatMap((_x: number) =>
        Either.right<never, number>(0),
      );

      expect(flatMapped.isLeft()).toBe(true);
      expect(flatMapped.left()).toBe(error);
    });

    it("should handle flatMap that returns error", () => {
      const value = 21;
      const result = Result.ok<number, string>(value);
      const flatMapped = result.flatMap((_x: number) =>
        Either.left<string, number>("FlatMap error"),
      );

      expect(flatMapped.isLeft()).toBe(true);
      expect(flatMapped.left()).toBe("FlatMap error");
    });
  });

  describe("inherited methods", () => {
    it("should inherit map from Either", () => {
      const value = 21;
      const result = Result.ok<number, string>(value);
      const mapped = result.map((x: number) => x * 2);

      expect(mapped.isRight()).toBe(true);
      expect(mapped.right()).toBe(42);
    });

    it("should inherit mapLeft from Either", () => {
      const error = "Error";
      const result = Result.error<number, string>(error);
      const mapped = result.mapLeft((e: string) => `Mapped: ${e}`);

      expect(mapped.isLeft()).toBe(true);
      expect(mapped.left()).toBe("Mapped: Error");
    });

    it("should inherit fold from Either", () => {
      const value = 42;
      const result = Result.ok<number, string>(value);
      const folded = result.fold(
        (e: string) => `Error: ${e}`,
        (v: number) => `Success: ${v}`,
      );

      expect(folded).toBe("Success: 42");
    });
  });
});
