describe('Personal Website', () => {
  beforeAll(async () => {
    // Load the HTML file
    document.body.innerHTML = await (await fetch('file://' + __dirname + '/../index.html')).text();
  });

  test('should have a title', () => {
    expect(document.title).not.toBe('');
  });

  test('should have a header', () => {
    const header = document.querySelector('header');
    expect(header).not.toBeNull();
  });
});
