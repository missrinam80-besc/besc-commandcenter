import assert from "node:assert/strict";
import test from "node:test";
import { sameSqlForReview, sqlReviewTokens } from "../scripts/foundation/sql-review.mjs";

test("SQL review accepteert opmaak en sleutelwoordhoofdletters maar bewaart waarden", () => {
  assert.equal(sameSqlForReview("SELECT a FROM t WHERE x='UPDATE';", "select a\nfrom t -- uitleg\nwhere x = 'UPDATE';"), true);
  assert.equal(sameSqlForReview("select 'UPDATE'", "select 'update'"), false);
  assert.equal(sameSqlForReview('select "Case"', 'select "case"'), false);
  assert.equal(sameSqlForReview("select 'a  b'", "select 'a b'"), false);
});

test("SQL review verbergt geen gewijzigde conditie, operator of dollarstring", () => {
  assert.equal(sameSqlForReview("a >= b", "a > = b"), false);
  assert.equal(sameSqlForReview("a AND b", "a OR b"), false);
  assert.equal(sameSqlForReview("execute $$select  a$$", "execute $$select a$$"), false);
  assert.equal(sameSqlForReview("select 'a'\n'b'", "select 'a' 'b'"), false);
  assert.equal(sameSqlForReview("select E'a\\'b'", "select E'a\\'b'"), true);
});

test("SQL review behandelt commentaar genest en faalt gesloten bij afgebroken invoer", () => {
  assert.deepEqual(sqlReviewTokens("select /* outer /* inner */ done */ '/*literal*/'"), ["select", "'/*literal*/'"]);
  for (const source of ["select 'broken", "/* broken", "select $x$broken"]) assert.throws(() => sqlReviewTokens(source));
  assert.equal(sameSqlForReview("begin return new;end", "BEGIN RETURN new; END;"), false);
  assert.equal(sameSqlForReview("begin return new;end", "BEGIN RETURN new; END;", { plpgsqlFinalSemicolon: true }), true);
});
