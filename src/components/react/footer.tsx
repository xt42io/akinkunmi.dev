function yearToRoman(year: number): string {
  const numerals = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ] as const;

  let result = "";
  for (const [value, symbol] of numerals) {
    while (year >= value) {
      result += symbol;
      year -= value;
    }
  }
  return result;
}

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p>© <span title={String(year)}>{yearToRoman(year)}</span> Akinkunmi</p>
    </footer>
  );
};

export default Footer;
