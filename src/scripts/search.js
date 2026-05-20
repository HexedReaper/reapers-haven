//grab list directly from HTML element's data attribute
const search_modal = document.querySelector('#search-modal');
const search_list = JSON.parse(search_modal?.dataset.searchlist || '[]');

//function to form snippet for result found in content ==========================
function getSnippet(content, query){
  var match_index = content.toLowerCase().indexOf(query.toLowerCase());
  if (match_index === -1) {
      return "";            
  }

  var begin_cut = Math.max(0, match_index - 40);
  var end_cut = match_index+query.length + 40;
  
  //find start of a word, so i dont jst cut in the middle and get some sus results......
  var real_begin = content.lastIndexOf(" ", begin_cut);
  
  if (real_begin === -1){
      real_begin = 0;
  }
  //same for end
  var real_end = content.indexOf(" ", end_cut);
  
  if (real_end === -1){
      real_end = content.length;
  }

  var snippet = content.substring(real_begin, real_end);

  //will look like this: ...i love cats...
  return "..." + snippet + "...";
}


var search_btn = document.querySelector('#open-search-btn');
var close_search_btn = document.querySelector('#close-search-btn') 

var searcbox = document.querySelector('#search-input');

// ===============================================================================
// SEARCHBOX INPUT LISTENER
searcbox?.addEventListener('input', (event) => {
  //query is what user types in input
  var query = event.target.value.toLowerCase();

  //.filter() checks if search_list contains query:
  //it can return both title and content
  var filetered_results = search_list.filter((item)=> {
      return item.title.toLowerCase().includes(query) 
      || item.content.toLowerCase().includes(query);
  });

  //console.log(filetered_results);
  //search-results is for <ul>, where soon will be found results 
  // in forms of link + title OR also snippet for where found in content
  var search_returns = document.querySelector('#search-results');
  
  if (!search_returns) return;
  search_returns.innerHTML = "";
  
  var formed_tags = "";
  //loop through each element of results.
  filetered_results.forEach(element => {
      //make snippet string
      var snippet_text = getSnippet(element.content, query);
      if (snippet_text !== "") {
        formed_tags += `
        <li>
            <a href="${element.url}">${element.title}</a>
            <details style="margin-top: 5px; font-size: 0.9em; opacity: 0.8;">
                <summary style="cursor: pointer; color: var(--accent);">[+] Expand Context</summary>
                <p style="padding-left: 15px; border-left: 1px dashed var(--accent); margin-top: 5px;">
                    ${snippet_text}
                </p>
            </details>
        </li>`               
      }
      else{ //no snippet, only link and title
          formed_tags += `<li><a href="${element.url}">${element.title}</a></li>`
      }
    });

  search_returns.innerHTML = formed_tags;
});

// ===============================================================================
// BTN CLICK LISTENERS
search_btn?.addEventListener('click', (event) => {
  search_modal?.showModal();
});

close_search_btn?.addEventListener('click', (event) => {
  search_modal?.close();
});
// ===============================================================================
// KEYDOWN LISTENER
document.addEventListener('keydown', (event) => {
  //if CTRL+K => open modal and focus on searchbox
  if(event.ctrlKey && event.key === 'k'){
    event.preventDefault();
    search_modal?.showModal();
    searcbox?.focus();
  }
});

// ===============================================================================